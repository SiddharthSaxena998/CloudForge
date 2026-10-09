const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
const Container = require('../models/Container');
const Log = require('../models/Log');
const { buildImage, runContainer, getFreePort } = require('../utils/docker');
const { sendNotification } = require('../utils/notify');
const { detectFramework } = require('../utils/frameworkDetector');

// ---------- helpers ----------
const emitLog = async (deploymentId, level, message) => {
  try {
    await Log.create({ deployment: deploymentId, level, message, timestamp: new Date() });
  } catch (e) {
    console.error('Log save failed:', e.message);
  }
};

const getCommit = (dir) =>
  new Promise((resolve) => {
    if (!dir) return resolve('');
    execFile('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], (err, out) =>
      resolve(err ? '' : out.trim())
    );
  });

// ---------- app folder detection ----------
const MANIFESTS = ['package.json', 'requirements.txt', 'go.mod', 'manage.py', 'index.html'];
const PREFERRED_SUBDIRS = ['backend', 'server', 'api', 'app', 'frontend', 'client', 'web'];
const SKIP = new Set(['.git', 'node_modules']);

const hasManifest = (dir) => MANIFESTS.some((f) => fs.existsSync(path.join(dir, f)));

// repo root mein manifest nahi hai to subfolder mein dhundho
const findAppDir = (root) => {
  if (hasManifest(root)) return root;
  for (const sub of PREFERRED_SUBDIRS) {
    const d = path.join(root, sub);
    if (fs.existsSync(d) && fs.statSync(d).isDirectory() && hasManifest(d)) return d;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
    const d = path.join(root, entry.name);
    if (hasManifest(d)) return d;
  }
  return root;
};

const readPkg = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
};

// ---------- Dockerfiles ----------
const staticBuild = (outDir) => `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/${outDir} /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

const nodeApp = (pkg) => {
  let cmd = '["npm", "start"]';
  if (!pkg?.scripts?.start) cmd = `["node", "${pkg?.main || 'index.js'}"]`;
  return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ${cmd}
`;
};

const DOCKERFILES = {
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

// framework + folder ke hisaab se Dockerfile likho, container port return karo
const generateDockerfile = (appDir, framework) => {
  const pkg = readPkg(appDir);
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  let cfg;

  if (framework === 'React' || deps['react-scripts']) {
    cfg = { port: 80, text: staticBuild('build') };
  } else if (pkg && deps['vite'] && !pkg.scripts?.start) {
    cfg = { port: 80, text: staticBuild('dist') };
  } else if (pkg) {
    cfg = { port: 3000, text: nodeApp(pkg) };
  } else {
    cfg = DOCKERFILES[framework] || { port: 3000, text: nodeApp(null) };
  }

  fs.writeFileSync(path.join(appDir, 'Dockerfile'), cfg.text);
  return { containerPort: cfg.port };
};

// deployment tabhi milega jab uska project current user ka ho
const findOwnedDeployment = async (req) => {
  const deployment = await Deployment.findById(req.params.id);
  if (!deployment) return null;
  const owns = await Project.exists({ _id: deployment.project, owner: req.user._id });
  return owns ? deployment : null;
};

// ---------- pipeline ----------
const runDeploymentPipeline = async (deployment, project) => {
  const deploymentId = deployment._id;
  const setProject = (patch) => Project.updateOne({ _id: project._id }, { $set: patch });

  try {
    await emitLog(deploymentId, 'info', `Deployment started for ${project.name}`);
    deployment.status = 'building';
    await deployment.save();

    const appDir = findAppDir(project.sourcePath);
    const relDir = path.relative(project.sourcePath, appDir) || '.';
    await emitLog(deploymentId, 'info', `App folder: ${relDir}`);
    if (!hasManifest(appDir)) {
      throw new Error('No package.json, requirements.txt, go.mod or index.html found in the repository.');
    }

    const framework = detectFramework(appDir) || 'Node.js';
    await emitLog(deploymentId, 'info', `Detected framework: ${framework}`);

    const { containerPort } = generateDockerfile(appDir, framework);
    await emitLog(deploymentId, 'info', 'Dockerfile generated');

    await emitLog(deploymentId, 'info', 'Building Docker image (first build can take a few minutes)...');
    await buildImage(deployment.imageTag, appDir);
    await emitLog(deploymentId, 'success', 'Docker image built successfully');

    await emitLog(deploymentId, 'info', 'Starting container...');
    const userEnv = (project.envVars || []).reduce((acc, ev) => {
      acc[ev.key] = ev.value;
      return acc;
    }, {});
    // app container ke andar wahi port sune jo hum map kar rahe hain
    const envVars = { ...userEnv, PORT: String(containerPort) };

    const hostPort = await getFreePort();
    const containerName = `${project.name}-${String(deploymentId).slice(0, 8)}`;
    const containerResult = await runContainer(
      deployment.imageTag,
      containerName,
      envVars,
      hostPort,
      containerPort
    );

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

    deployment.status = 'running';
    deployment.finishedAt = new Date();
    await deployment.save();
    await setProject({ status: 'running', lastDeployedAt: new Date(), framework });

    await emitLog(deploymentId, 'success', `Deployment successful! Open http://localhost:${hostPort}`);
    await sendNotification(deployment.triggeredBy, `Project ${project.name} deployed successfully!`, 'success');
  } catch (error) {
    console.error('Deployment failed:', error);
    deployment.status = 'failed';
    deployment.errorMessage = error.message;
    deployment.finishedAt = new Date();
    await deployment.save().catch(() => {});
    await setProject({ status: 'failed' }).catch(() => {});

    await emitLog(deploymentId, 'error', `Deployment failed: ${error.message}`);
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
    const project = await Project.findOne({ _id: req.params.id, owner: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!project.sourcePath) {
      return res.status(400).json({ message: 'Project has no source to deploy' });
    }
    if (project.status === 'building') {
      return res.status(409).json({ message: 'A deployment is already in progress' });
    }

    const deployment = await Deployment.create({
      project: project._id,
      triggeredBy: req.user._id,
      imageTag: `cloudforge/${project.name}:${Date.now()}`,
      status: 'pending',
      source: project.sourceType === 'github' ? project.branch : project.archiveName,
      commit: project.sourceType === 'github' ? await getCommit(project.sourcePath) : '',
    });

    project.status = 'building';
    await project.save();

    // background mein chalao, response turant do
    runDeploymentPipeline(deployment, project).catch(console.error);

    res.status(202).json({ deployment });
  } catch (error) {
    next(error);
  }
};

exports.getDeployments = async (req, res, next) => {
  try {
    const projectIds = await Project.find({ owner: req.user._id }).distinct('_id');
    const filter = { project: { $in: projectIds } };
    if (req.query.status) filter.status = req.query.status;

    const deployments = await Deployment.find(filter).sort({ createdAt: -1 });
    res.json(deployments);
  } catch (error) {
    next(error);
  }
};

exports.getDeploymentById = async (req, res, next) => {
  try {
    const deployment = await findOwnedDeployment(req);
    if (!deployment) return res.status(404).json({ message: 'Deployment not found' });
    res.json(deployment);
  } catch (error) {
    next(error);
  }
};

exports.getDeploymentLogs = async (req, res, next) => {
  try {
    const deployment = await findOwnedDeployment(req);
    if (!deployment) return res.status(404).json({ message: 'Deployment not found' });

    const logs = await Log.find({ deployment: deployment._id }).sort({ timestamp: 1, _id: 1 });
    res.json(logs);
  } catch (error) {
    next(error);
  }
};