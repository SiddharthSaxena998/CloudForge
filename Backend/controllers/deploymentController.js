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
  } catch (e) {
    console.error('Log save failed:', e.message);
  }
};

const getCommit = (dir) =>
  new Promise((resolve) => {
    if (!dir) return resolve('');

    execFile(
      'git',
      ['-C', dir, 'rev-parse', '--short', 'HEAD'],
      (err, out) => {
        resolve(err ? '' : out.trim());
      }
    );
  });

// ---------- Dockerfiles ----------

const DOCKERFILES = {
  'Node.js': {
    port: 3000,
    text: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
`,
  },

  React: {
    port: 80,
    text: `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
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
    text: `FROM golang:1.21-alpine AS builder
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

const DEFAULT_DOCKERFILE = {
  port: 3000,
  text: `FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`,
};

const generateDockerfile = (sourcePath, framework) => {
  const cfg = DOCKERFILES[framework] || DEFAULT_DOCKERFILE;

  const dockerfilePath = path.join(sourcePath, 'Dockerfile');

  fs.writeFileSync(dockerfilePath, cfg.text);

  return {
    dockerfilePath,
    containerPort: cfg.port,
  };
};

// ---------- ownership ----------

const findOwnedDeployment = async (req) => {
  const deployment = await Deployment.findById(req.params.id);

  if (!deployment) {
    return null;
  }

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

  try {
    // 1. Start deployment
    await emitLog(
      deploymentId,
      'info',
      `Deployment started for ${project.name}`
    );

    deployment.status = 'building';
    await deployment.save();

    // 2. Detect framework
    const framework =
      project.framework ||
      detectFramework(project.sourcePath) ||
      'Node.js';

    await emitLog(
      deploymentId,
      'info',
      `Detected framework: ${framework}`
    );

    // 3. Generate Dockerfile
    const {
      dockerfilePath,
      containerPort,
    } = generateDockerfile(
      project.sourcePath,
      framework
    );

    await emitLog(
      deploymentId,
      'info',
      'Dockerfile generated'
    );

    // 4. Build Docker image
    await emitLog(
      deploymentId,
      'info',
      'Building Docker image...'
    );

    await buildImage(
      deployment.imageTag,
      project.sourcePath,
      path.basename(dockerfilePath)
    );

    await emitLog(
      deploymentId,
      'success',
      'Docker image built successfully'
    );

    // 5. Prepare environment variables
    await emitLog(
      deploymentId,
      'info',
      'Starting container...'
    );

    const envVars = (project.envVars || []).reduce(
      (acc, ev) => {
        acc[ev.key] = ev.value;
        return acc;
      },
      {}
    );

    // 6. Find free host port
    const hostPort = await getFreePort();
    deployment.hostPort = hostPort;
deployment.containerPort = containerPort;
await deployment.save();

    // 7. Create unique container name
    const containerName =
      `${project.name}-${String(deploymentId).slice(0, 8)}`;

    // 8. Start Docker container
    const containerResult = await runContainer(
      deployment.imageTag,
      containerName,
      envVars,
      hostPort,
      containerPort
    );
    deployment.hostPort = hostPort;
deployment.containerPort = containerPort;
await deployment.save();

    // 9. Save container information
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

    // 10. Mark deployment as running
    deployment.status = 'running';
    deployment.finishedAt = new Date();

    await deployment.save();

    // 11. Mark project as running
    await setProject({
      status: 'running',
      lastDeployedAt: new Date(),
      framework,
    });

    // 12. Success log
    await emitLog(
      deploymentId,
      'success',
      `Deployment successful! Container running on port ${hostPort}`
    );

    // 13. Success notification
    await sendNotification(
      deployment.triggeredBy,
      `Project ${project.name} deployed successfully!`,
      'success'
    );
  } catch (error) {
    console.error('Deployment failed:', error);

    deployment.status = 'failed';
    deployment.errorMessage = error.message;
    deployment.finishedAt = new Date();

    await deployment.save().catch(() => {});

    await setProject({
      status: 'failed',
    }).catch(() => {});

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
      return res.status(404).json({
        message: 'Project not found',
      });
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
      imageTag: `cloudforge/${project.name}:${Date.now()}`,
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

    // Run deployment in background
    runDeploymentPipeline(
      deployment,
      project
    ).catch(console.error);

    // Immediately return deployment
    res.status(202).json({
      deployment,
    });
  } catch (error) {
    next(error);
  }
};

exports.getDeployments = async (req, res, next) => {
  try {
    const projectIds = await Project.find({
      owner: req.user._id,
    }).distinct('_id');

    const filter = {
      project: {
        $in: projectIds,
      },
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const deployments = await Deployment.find(filter)
      .sort({ createdAt: -1 });

    res.json(deployments);
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
    }).sort({
      timestamp: 1,
      _id: 1,
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
};