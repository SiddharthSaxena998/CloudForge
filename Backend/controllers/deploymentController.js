const path = require('path');
const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
const Container = require('../models/Container');
const Log = require('../models/Log');
const { run, buildImage, stopContainer, getFreePort } = require('../utils/docker');
const { sendNotification } = require('../utils/notify');
const { detectFramework } = require('../utils/frameworkDetector');

const emitLog = (deploymentId, level, message, socket) => {
  const log = { deploymentId, level, message, timestamp: new Date() };
  Log.create(log).catch(console.error);
  if (socket) {
    socket.to(`deployment-${deploymentId}`).emit('deployment-log-update', log);
  }
};

const detectFrameworkForProject = (project) => {
  if (project.sourceType === 'upload' && project.sourcePath) {
    return detectFramework(project.sourcePath);
  }
  return project.framework || 'Node.js';
};

exports.triggerDeployment = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const deployment = await Deployment.create({
      project: project._id,
      triggeredBy: req.user._id,
      imageTag: `cloudforge/${project.name}:${Date.now()}`,
      status: 'pending',
    });

    // Update project status
    project.status = 'building';
    await project.save();

    // Start deployment in background
    runDeploymentPipeline(deployment, project, null);

    res.status(202).json({ deployment });
  } catch (error) {
    next(error);
  }
};

const runDeploymentPipeline = async (deployment, project, socket) => {
  try {
    const deploymentId = deployment._id;
    emitLog(deploymentId, 'info', `Deployment started for ${project.name}`, socket);

    // Set status to building
    deployment.status = 'building';
    await deployment.save();

    // Detect framework
    const framework = detectFrameworkForProject(project);
    emitLog(deploymentId, 'info', `Detected framework: ${framework}`, socket);

    // Generate Dockerfile based on framework
    const dockerfilePath = generateDockerfile(project.sourcePath, framework, project);
    emitLog(deploymentId, 'info', 'Dockerfile generated', socket);

    // Build image
    emitLog(deploymentId, 'info', 'Building Docker image...', socket);
    const buildResult = await run(dockerfilePath, deployment.imageTag);
    emitLog(deploymentId, 'info', 'Docker image built successfully', socket);

    // Run container
    emitLog(deploymentId, 'info', 'Starting container...', socket);
    const envVars = project.envVars?.reduce((acc, ev) => {
      acc[ev.key] = ev.value;
      return acc;
    }, {});

    const hostPort = await getFreePort();
    const containerPort = 3000;
    const containerName = `${project.name}-${deploymentId.slice(0, 8)}`;

    const containerResult = await buildImage(deployment.imageTag, containerName, envVars, hostPort, containerPort);

    // Create Container document
    await Container.create({
      deployment: deployment._id,
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

    // Update deployment status to running
    deployment.status = 'running';
    deployment.finishedAt = new Date();
    await deployment.save();

    // Update project status
    project.status = 'running';
    await project.save();

    emitLog(deploymentId, 'success', `Deployment successful! Container running on port ${hostPort}`, socket);

    // Send notification
    const user = await deployment.triggeredBy;
    await sendNotification(user, `Project ${project.name} deployed successfully!`, 'success');
  } catch (error) {
    console.error('Deployment failed:', error);
    deployment.status = 'failed';
    deployment.errorMessage = error.message;
    deployment.finishedAt = new Date();
    await deployment.save();

    project.status = 'failed';
    await project.save();

    emitLog(deployment._id, 'error', `Deployment failed: ${error.message}`, null);

    const user = await deployment.triggeredBy;
    await sendNotification(user, `Project deployment failed: ${error.message}`, 'failure');
  }
};

const generateDockerfile = (sourcePath, framework, project) => {
  const path = require('path');
  let dockerfile = '';

  switch (framework) {
    case 'Node.js':
      dockerfile = `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
`;
      break;
    case 'React':
      dockerfile = `
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
`;
      break;
    case 'Python Flask':
      dockerfile = `
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
CMD ["python", "app.py"]
`;
      break;
    case 'Django':
      dockerfile = `
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
CMD ["python", "manage.py", "runserver", "0.0.0.0:3000"]
`;
      break;
    case 'Go':
      dockerfile = `
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 3000
CMD ["./main"]
`;
      break;
    case 'static HTML':
      dockerfile = `
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
`;
      break;
    default:
      dockerfile = `
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;
  }

  const fs = require('fs');
  const dockerfilePath = path.join(sourcePath, 'Dockerfile');
  fs.writeFileSync(dockerfilePath, dockerfile);
  return dockerfilePath;
};

exports.getDeployments = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { 'project.owner': req.user._id };
    if (status) filter.status = status;

    const deployments = await Deployment.find(filter)
      .populate('project', 'name owner')
      .populate('triggeredBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(deployments);
  } catch (error) {
    next(error);
  }
};

exports.getDeploymentById = async (req, res, next) => {
  try {
    const deployment = await Deployment.findById(req.params.id)
      .populate('project', 'name owner')
      .populate('triggeredBy', 'name email');

    if (!deployment || !deployment.project) {
      return res.status(404).json({ message: 'Deployment not found' });
    }

    // Check ownership
    const project = await Project.findById(deployment.project._id);
    if (!project || project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(deployment);
  } catch (error) {
    next(error);
  }
};

exports.getDeploymentLogs = async (req, res, next) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment || !deployment.project) {
      return res.status(404).json({ message: 'Deployment not found' });
    }

    // Check ownership
    const project = await Project.findById(deployment.project._id);
    if (!project || project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const logs = await Log.find({ deployment: deployment._id }).sort({ timestamp: 1 });
    res.json(logs);
  } catch (error) {
    next(error);
  }
};