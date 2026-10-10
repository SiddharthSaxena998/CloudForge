
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
const Container = require('../models/Container');
const Log = require('../models/Log');

const {
  buildImage,
  runContainer,
  getFreePort,
  isContainerRunning,
} = require('../utils/docker');

const { sendNotification } = require('../utils/notify');
const { detectFramework } = require('../utils/frameworkDetector');

// ---------- helpers ----------

const emitLog = async (deploymentId, level, message) => {
  try {
    await Log.create({
      deployment: deploymentId,
      level,
      message,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Log save failed:', error.message);
  }
};

const getCommit = (dir) =>
  new Promise((resolve) => {
    if (!dir) return resolve('');

    execFile(
      'git',
      ['-C', dir, 'rev-parse', '--short', 'HEAD'],
      (error, output) => resolve(error ? '' : output.trim())
    );
  });

// ---------- Dockerfiles ----------

const DOCKERFILES = {
  'Next.js': {
    port: 3000,
    text: `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`,
  },

  'Node.js': {
    port: 3000,
    text: `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
`,
  },

  React: {
    port: 80,
    text: `FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
  },

  'Python Flask': {
    port: 3000,
    text: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["python", "app.py"]
`,
  },

  Django: {
    port: 3000,
    text: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
CMD ["python", "manage.py", "runserver", "0.0.0.0:3000"]
`,
  },

  Go: {
    port: 3000,
    text: `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 3000
CMD ["./main"]
`,
  },

  'static HTML': {
    port: 80,
    text: `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
  },
};

const generateDockerfile = (sourcePath, framework, buildArgNames = []) => {
  const config = DOCKERFILES[framework];

  if (!config) {
    throw new Error(
      `Unsupported framework "${framework}". Cannot generate a safe Dockerfile.`
    );
  }

  const dockerfilePath = path.join(sourcePath, 'Dockerfile');
  const safeBuildArgNames = framework === 'Next.js'
    ? buildArgNames.filter((key) => /^NEXT_PUBLIC_[A-Z0-9_]+$/.test(key))
    : [];
  const buildArgDeclarations = safeBuildArgNames
    .map((key) => `ARG ${key}`)
    .join('\n');
  const dockerfileText = buildArgDeclarations
    ? config.text.replace(
        'RUN npm run build',
        `${buildArgDeclarations}\nRUN npm run build`
      )
    : config.text;
  fs.writeFileSync(dockerfilePath, dockerfileText);

  return {
    dockerfilePath,
    containerPort: config.port,
  };
};

// ---------- ownership ----------

const findOwnedDeployment = async (req) => {
  const deployment = await Deployment.findById(req.params.id);

  if (!deployment) return null;

  const owns = await Project.exists({
    _id: deployment.project,
    owner: req.user._id,
  });

  return owns ? deployment : null;
};

// ---------- deployment pipeline ----------

const runDeploymentPipeline = async (deployment, project) => {
  const deploymentId = deployment._id;

  const setProject = (patch) =>
    Project.updateOne(
      { _id: project._id },
      { $set: patch }
    );

  let containerResult = null;

  try {
    await emitLog(
      deploymentId,
      'info',
      `Deployment started for ${project.name}`
    );

    deployment.status = 'building';
    await deployment.save();

    // Detect framework from actual source, not stale DB metadata.
    const framework = detectFramework(project.sourcePath);

    await emitLog(
      deploymentId,
      'info',
      `Detected framework: ${framework}`
    );

    const envVars = (project.envVars || []).reduce(
      (acc, variable) => {
        acc[variable.key] = variable.value;
        return acc;
      },
      {}
    );
    const buildArgs = framework === 'Next.js'
      ? Object.fromEntries(
          Object.entries(envVars).filter(([key]) =>
            /^NEXT_PUBLIC_[A-Z0-9_]+$/.test(key)
          )
        )
      : {};

    const { dockerfilePath, containerPort } =
      generateDockerfile(project.sourcePath, framework, Object.keys(buildArgs));

    await emitLog(
      deploymentId,
      'info',
      `Dockerfile generated for ${framework}`
    );

    await emitLog(
      deploymentId,
      'info',
      'Building Docker image...'
    );

    await buildImage(
      deployment.imageTag,
      project.sourcePath,
      path.basename(dockerfilePath),
      (line) => {
        void emitLog(deploymentId, 'info', line);
      },
      buildArgs
    );

    await emitLog(
      deploymentId,
      'success',
      'Docker image built successfully'
    );

    // Ensure Next.js binds to the container interface.
    if (framework === 'Next.js') {
      envVars.HOSTNAME = '0.0.0.0';
      envVars.PORT = '3000';
      envVars.NODE_ENV = 'production';
    }

    await emitLog(
      deploymentId,
      'info',
      'Starting container...'
    );

    const hostPort = await getFreePort();

    deployment.hostPort = hostPort;
    deployment.containerPort = containerPort;
    await deployment.save();

    const containerName =
      `${String(project.name).toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}-${String(deploymentId).slice(0, 8)}`;

    containerResult = await runContainer(
      deployment.imageTag,
      containerName,
      envVars,
      hostPort,
      containerPort
    );

    // Give Docker a moment to report an immediate crash.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const inspect = await containerResult.container.inspect();

    if (!inspect.State.Running) {
      let containerLogs = '';

      try {
        containerLogs = await new Promise((resolve, reject) => {
          containerResult.container.logs(
            {
              stdout: true,
              stderr: true,
              tail: 60,
            },
            (error, output) => {
              if (error) return reject(error);
              resolve(output.toString());
            }
          );
        });
      } catch (_) {
        // Preserve the container state error even if logs cannot be read.
      }

      throw new Error(
        `Container exited immediately. ${inspect.State.Error || ''} ${containerLogs}`
      );
    }

    await Container.create({
      deployment: deploymentId,
      project: project._id,
      containerId: containerResult.id,
      name: containerName,
      hostPort,
      containerPort,
      status: 'running',
      cpuUsagePercent: 0,
      memoryUsageMB: 0,
      lastCheckedAt: new Date(),
    });

    deployment.hostPort = hostPort;
deployment.containerPort = containerPort;
deployment.deploymentUrl = `http://localhost:${hostPort}`;
deployment.status = 'running';
deployment.finishedAt = new Date();
deployment.errorMessage = '';

await deployment.save();

    await setProject({
      status: 'running',
      lastDeployedAt: new Date(),
      framework,
    });

    await emitLog(
      deploymentId,
      'success',
      `Deployment successful! Live URL: http://localhost:${hostPort}`
    );

    await sendNotification(
      deployment.triggeredBy,
      `Project ${project.name} deployed successfully!`,
      'success'
    );
  } catch (error) {
    console.error('Deployment failed:', error);

    if (containerResult?.container) {
      try {
        await containerResult.container.stop();
      } catch (_) {}
    }

    deployment.status = 'failed';
    deployment.errorMessage = error.message;
    deployment.finishedAt = new Date();
    await deployment.save().catch(() => {});

    await setProject({ status: 'failed' }).catch(() => {});

    await emitLog(
      deploymentId,
      'error',
      `Deployment failed: ${error.message}`
    );

    await sendNotification(
      deployment.triggeredBy,
      `Deployment of ${project.name} failed: ${error.message}`,
      'failure'
    ).catch(() => {});
  }
};

// ---------- handlers ----------

exports.triggerDeployment = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.sourcePath) {
      return res.status(400).json({
        message: 'Project has no source to deploy',
      });
    }

    if (project.status === 'building') {
      return res.status(409).json({
        message: 'A deployment is already in progress',
      });
    }

    const deployment = await Deployment.create({
      project: project._id,
      triggeredBy: req.user._id,
      imageTag: `cloudforge/${String(project.name).toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}:${Date.now()}`,
      status: 'pending',
      source:
        project.sourceType === 'github'
          ? project.branch
          : project.archiveName,
      commit:
        project.sourceType === 'github'
          ? await getCommit(project.sourcePath)
          : '',
    });

    project.status = 'building';
    await project.save();

    runDeploymentPipeline(deployment, project).catch(console.error);

    return res.status(202).json({ deployment });
  } catch (error) {
    next(error);
  }
};

exports.getDeployments = async (req, res, next) => {
  try {
    const projectIds = await Project.find({
      owner: req.user._id,
    }).distinct('_id');

    const deployments = await Deployment.find({
      project: { $in: projectIds },
    }).sort({ createdAt: -1 });

    for (const deployment of deployments) {
      if (deployment.status !== 'running') continue;

      const container = await Container.findOne({
        deployment: deployment._id,
      });

      // Docker's state is authoritative, even if the DB container status is stale.
      const running = container
        ? await isContainerRunning(container.containerId)
        : false;

      if (!running) {
        deployment.status = 'stopped';
        deployment.finishedAt = new Date();
        await deployment.save();

        if (container && container.status !== 'stopped') {
          container.status = 'stopped';
          container.cpuUsagePercent = 0;
          container.memoryUsageMB = 0;
          container.lastCheckedAt = new Date();
          await container.save();
        }
      } else if (container.status !== 'running') {
        container.status = 'running';
        await container.save();
      }
    }

    for (const projectId of projectIds) {
      const activeDeployments = await Deployment.find({
        project: projectId,
        status: { $in: ['running', 'building', 'pending'] },
      }).select('status');

      const status = activeDeployments.some((deployment) => deployment.status === 'running')
        ? 'running'
        : activeDeployments.some((deployment) =>
            deployment.status === 'building' || deployment.status === 'pending'
          )
          ? 'building'
          : 'stopped';

      await Project.updateOne(
        { _id: projectId },
        { $set: { status } }
      );
    }

    const updatedFilter = { project: { $in: projectIds } };
    if (req.query.status) updatedFilter.status = req.query.status;

    const updatedDeployments = await Deployment.find(updatedFilter)
      .sort({ createdAt: -1 });

    res.json(updatedDeployments);
  } catch (error) {
    next(error);
  }
};

exports.getDeploymentById = async (req, res, next) => {
  try {
    const deployment = await findOwnedDeployment(req);

    if (!deployment) {
      return res.status(404).json({
        message: 'Deployment not found',
      });
    }

    res.json(deployment);
  } catch (error) {
    next(error);
  }
};

exports.getDeploymentLogs = async (req, res, next) => {
  try {
    const deployment = await findOwnedDeployment(req);

    if (!deployment) {
      return res.status(404).json({
        message: 'Deployment not found',
      });
    }

    const logs = await Log.find({
      deployment: deployment._id,
    }).sort({ timestamp: 1, _id: 1 });

    res.json(logs);
  } catch (error) {
    next(error);
  }
};
