
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
  stopContainer: stopDockerContainer,
  removeImage,
} = require('../utils/docker');

const { sendNotification } = require('../utils/notify');
const { detectFramework } = require('../utils/frameworkDetector');
const { startTunnel, stopTunnel } = require('../utils/tunnel');
const Semaphore = require('../utils/semaphore');
const { limits, limitsFor, isExempt } = require('../config/limits');
const { emitDeploymentLog, emitDeploymentStatus } = require('../utils/realtime');
const { assertDiskSpace } = require('../utils/diskGuard');
const { GENERATED_MARKER, findUserDockerfile, parseExposedPort, validPort } = require('../utils/dockerfileSupport');
const { waitForPort } = require('../utils/portCheck');
const { pullLatest } = require('../utils/git');

// At most N builds at the same time; others wait their turn (see MAX_CONCURRENT_BUILDS)
const buildSlots = new Semaphore(limits().maxConcurrentBuilds);

// ---------- helpers ----------

const emitLog = async (deploymentId, level, message) => {
  try {
    const entry = await Log.create({
      deployment: deploymentId,
      level,
      message,
      timestamp: new Date(),
    });
    emitDeploymentLog(deploymentId, entry); // live stream to the dashboard
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
  // An uploaded archive may contain `Dockerfile` as a symlink (e.g. -> some file of this server):
  // remove the link first so we never write THROUGH it.
  fs.rmSync(dockerfilePath, { force: true });
  fs.writeFileSync(
    dockerfilePath,
    `${GENERATED_MARKER} for ${framework}. Regenerated on every deploy; delete this line to use your own Dockerfile.\n${dockerfileText}`
  );

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

const retirePreviousDeployments = async (projectId, newDeploymentId, newContainerId) => {
  const oldContainers = await Container.find({
    project: projectId,
    _id: { $ne: newContainerId },
    status: 'running',
  });

  for (const old of oldContainers) {
    try {
      stopTunnel(old._id);
      await stopDockerContainer(old.containerId);
    } catch (error) {
      if (error.statusCode !== 404) console.error('Could not stop old container:', error.message);
    }
    old.status = 'stopped';
    old.publicUrl = '';
    old.cpuUsagePercent = 0;
    old.memoryUsageMB = 0;
    await old.save();
  }

  const oldDeployments = await Deployment.find({
    project: projectId,
    _id: { $ne: newDeploymentId },
    status: 'running',
  });

  for (const dep of oldDeployments) {
    dep.status = 'stopped';
    dep.finishedAt = new Date();
    await dep.save();
    removeImage(dep.imageTag); // frees disk once its container is stopped (ignored if still in use)
  }
};

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
    emitDeploymentStatus(deploymentId, 'building');

    // GitHub projects: redeploying should build the newest commit, not the old clone.
    if (project.sourceType === 'github' && project.branch) {
      await emitLog(deploymentId, 'info', `Pulling latest commit of branch "${project.branch}"...`);
      try {
        const pulled = await pullLatest(project.sourcePath, project.branch);
        if (pulled.skipped) {
          await emitLog(
            deploymentId,
            'warn',
            `Skipped pulling new commits: files were edited in the dashboard (kept as they are). Building commit ${pulled.commit}.`
          );
        } else if (pulled.updated) {
          await emitLog(deploymentId, 'success', `Updated ${pulled.before} -> ${pulled.commit}`);
        } else {
          await emitLog(deploymentId, 'info', `Already up to date (${pulled.commit})`);
        }
        if (pulled.commit) {
          deployment.commit = pulled.commit;
          await deployment.save();
        }
      } catch (error) {
        await emitLog(
          deploymentId,
          'warn',
          `Could not pull new commits (${String(error.message).split('\n')[0]}). Building the code that is already here.`
        );
      }
    }

    const envVars = (project.envVars || []).reduce(
      (acc, variable) => {
        acc[variable.key] = variable.value;
        return acc;
      },
      {}
    );

    // Port the app listens on: project setting > PORT env var > Dockerfile EXPOSE > framework default
    const requestedPort = validPort(project.port)
      ? project.port
      : validPort(Number(envVars.PORT))
        ? Number(envVars.PORT)
        : null;

    let framework;
    let dockerfilePath;
    let containerPort;
    let buildArgs = {};

    const userDockerfile = findUserDockerfile(project.sourcePath);

    if (userDockerfile) {
      // The user brought their own Dockerfile: build exactly that.
      framework = 'Dockerfile';
      const exposed = parseExposedPort(userDockerfile.content);
      containerPort = requestedPort || exposed || 3000;
      dockerfilePath = userDockerfile.path;

      await emitLog(
        deploymentId,
        'info',
        `Using your own Dockerfile. App port: ${containerPort} (${
          requestedPort ? 'from your port setting' : exposed ? 'from EXPOSE' : 'default, no EXPOSE found'
        })`
      );
    } else {
      // Detect framework from actual source, not stale DB metadata.
      framework = detectFramework(project.sourcePath);

      await emitLog(deploymentId, 'info', `Detected framework: ${framework}`);

      buildArgs = framework === 'Next.js'
        ? Object.fromEntries(
            Object.entries(envVars).filter(([key]) =>
              /^NEXT_PUBLIC_[A-Z0-9_]+$/.test(key)
            )
          )
        : {};

      const generated = generateDockerfile(project.sourcePath, framework, Object.keys(buildArgs));
      dockerfilePath = generated.dockerfilePath;
      containerPort = requestedPort || generated.containerPort;

      await emitLog(
        deploymentId,
        'info',
        `Dockerfile generated for ${framework}. App port: ${containerPort}`
      );
    }

    await emitLog(
      deploymentId,
      'info',
      'Building Docker image...'
    );

    if (buildSlots.busy) {
      await emitLog(
        deploymentId,
        'info',
        `Waiting for a free build slot (${buildSlots.queued + 1} in queue)...`
      );
    }

    await buildSlots.run(() =>
      buildImage(
        deployment.imageTag,
        project.sourcePath,
        path.basename(dockerfilePath),
        (line) => {
          void emitLog(deploymentId, 'info', line);
        },
        buildArgs
      )
    );

    await emitLog(
      deploymentId,
      'success',
      'Docker image built successfully'
    );

    // Ensure Next.js binds to the container interface.
    if (framework === 'Next.js') {
      envVars.HOSTNAME = '0.0.0.0';
      envVars.PORT = String(containerPort);
      envVars.NODE_ENV = 'production';
    } else if (!envVars.PORT) {
      envVars.PORT = String(containerPort); // Heroku-style: the app can read its port from $PORT
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

    const containerDoc = await Container.create({
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

    // Is the app really answering on that port? Help the user when it is not (wrong port / crash).
    await emitLog(deploymentId, 'info', `Waiting for the app to answer on port ${containerPort}...`);
    const probe = await waitForPort(process.env.TUNNEL_TARGET_HOST || '127.0.0.1', hostPort, {
      isAlive: () => isContainerRunning(containerResult.id),
    });
    if (probe.up) {
      await emitLog(deploymentId, 'success', 'The app is answering.');
    } else if (!probe.alive) {
      await emitLog(
        deploymentId,
        'warn',
        'The app stopped right after starting. Open Containers -> Logs to see why.'
      );
    } else {
      await emitLog(
        deploymentId,
        'warn',
        `The app is running but nothing answers on port ${containerPort}. If it listens on another port, ` +
          'set it in Project -> Overview -> App port and deploy again (Containers -> Logs shows what it prints).'
      );
    }

    deployment.hostPort = hostPort;
deployment.containerPort = containerPort;
deployment.deploymentUrl = `http://localhost:${hostPort}`;

    // Free public link via Cloudflare Quick Tunnel (non-fatal if unavailable).
    await emitLog(deploymentId, 'info', 'Creating public link (Cloudflare Tunnel)...');
    const tunnel = await startTunnel(containerDoc._id, hostPort);
    if (tunnel.url) {
      deployment.publicUrl = tunnel.url;
      containerDoc.publicUrl = tunnel.url;
      await containerDoc.save();
      await emitLog(deploymentId, 'success', `Public URL: ${tunnel.url}`);
    } else {
      await emitLog(deploymentId, 'warn', `No public link: ${tunnel.reason}`);
    }

deployment.status = 'running';
deployment.finishedAt = new Date();
deployment.errorMessage = '';

await deployment.save();
    emitDeploymentStatus(deploymentId, 'running');

    // Redeploy = replace: stop older containers of this project so they do not
    // pile up, keep eating the quota, or hold on to old images.
    await retirePreviousDeployments(project._id, deploymentId, containerDoc._id).catch((e) =>
      console.error('Cleanup of previous deployments failed:', e.message)
    );

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
    emitDeploymentStatus(deploymentId, 'failed');

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

    // Abuse control: stop deploy spamming (each deploy = a full docker build)
    if (!isExempt(req.user)) {
      const { deployCooldownSec, maxDeploysPerHour } = limitsFor(req.user);
      if (deployCooldownSec) {
        const last = await Deployment.findOne({ triggeredBy: req.user._id })
          .sort({ createdAt: -1 })
          .select('createdAt');
        const waitSec = last
          ? Math.ceil(deployCooldownSec - (Date.now() - last.createdAt.getTime()) / 1000)
          : 0;
        if (waitSec > 0) {
          res.set('Retry-After', String(waitSec));
          return res.status(429).json({ message: `Please wait ${waitSec}s before deploying again.` });
        }
      }
      if (maxDeploysPerHour) {
        const lastHour = await Deployment.countDocuments({
          triggeredBy: req.user._id,
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        });
        if (lastHour >= maxDeploysPerHour) {
          return res.status(429).json({
            message: `Deploy limit reached: ${maxDeploysPerHour} deployments per hour. Try again later.`,
          });
        }
      }
    }

    await assertDiskSpace(path.resolve(__dirname, '..', 'uploads')); // 507 when the host disk is nearly full

    // Quota: running containers per user (this project's own containers get replaced, so not counted)
    if (!isExempt(req.user)) {
      const max = limitsFor(req.user).maxRunningContainers;
      const otherProjects = await Project.find({
        owner: req.user._id,
        _id: { $ne: project._id },
      }).distinct('_id');
      const running = await Container.countDocuments({
        project: { $in: otherProjects },
        status: 'running',
      });
      if (running >= max) {
        return res.status(403).json({
          message: `Limit reached: you can run ${max} apps at the same time. Stop another app first.`,
        });
      }
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
        emitDeploymentStatus(deployment._id, 'stopped');

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
