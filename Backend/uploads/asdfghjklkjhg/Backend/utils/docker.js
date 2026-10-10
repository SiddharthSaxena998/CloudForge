const Docker = require('dockerode');

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
});

exports.docker = docker;

exports.buildImage = (tag, contextDir, dockerfile = 'Dockerfile') => {
  return new Promise((resolve, reject) => {
    docker.buildImage(
      {
        context: contextDir,
        src: ['Dockerfile', 'package.json', 'package-lock.json', 'src', 'app', '.'],
        dockerfile,
      },
      { t: tag },
      (err, stream) => {
        if (err) return reject(err);
        stream.on('data', (chunk) => process.stdout.write(chunk.toString()));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      }
    );
  });
};

exports.runContainer = (imageTag, containerName, envVars = {}, hostPort = 0, containerPort = 3000) => {
  return new Promise((resolve, reject) => {
    docker.createContainer({
      Image: imageTag,
      name: containerName,
      Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
      ExposedPorts: { [`${containerPort}/tcp`]: {} },
      HostConfig: {
        PortBindings: {
          [`${containerPort}/tcp`]: [{ HostPort: String(hostPort || 0) }],
        },
      },
    }, (err, container) => {
      if (err) return reject(err);
      container.start((err, result) => {
        if (err) return reject(err);
        resolve({ container, id: container.id });
      });
    });
  });
};

exports.stopContainer = (containerId) => {
  return new Promise((resolve, reject) => {
    const container = docker.getContainer(containerId);
    container.stop((err) => {
      if (err && err.statusCode !== 304) return reject(err);
      container.remove((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

exports.getContainerStats = (containerId) => {
  return new Promise((resolve, reject) => {
    const container = docker.getContainer(containerId);
    container.stats({ stream: false }, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
};

exports.getContainerLogs = (containerId, tail = 'all') => {
  return new Promise((resolve, reject) => {
    const container = docker.getContainer(containerId);
    container.logs({
      stdout: true,
      stderr: true,
      tail,
      follow: false,
    }, (err, stream) => {
      if (err) return reject(err);
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
      stream.on('error', reject);
    });
  });
};

exports.getFreePort = () => {
  return new Promise((resolve, reject) => {
    docker.listContainers((err, containers) => {
      if (err) return reject(err);
      const usedPorts = new Set();
      containers.forEach((c) => {
        if (c.Ports) {
          c.Ports.forEach((p) => {
            if (p.PublicPort) usedPorts.add(p.PublicPort);
          });
        }
      });
      // Start from 4000 and find first free port
      let port = 4000;
      while (usedPorts.has(port)) port++;
      resolve(port);
    });
  });
};