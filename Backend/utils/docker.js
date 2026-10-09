
const Docker = require("dockerode");

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
});

exports.docker = docker;

exports.buildImage = (tag, contextDir, dockerfile = "Dockerfile") => {
  return new Promise((resolve, reject) => {
    docker.buildImage(
      {
        context: contextDir,
        src: ["."],
        dockerfile,
      },
      { t: tag },
      (err, stream) => {
        if (err) return reject(err);

        stream.on("data", (chunk) => {
          process.stdout.write(chunk.toString());
        });

        stream.on("end", resolve);
        stream.on("error", reject);
      }
    );
  });
};

exports.runContainer = (
  imageTag,
  containerName,
  envVars = {},
  hostPort = 0,
  containerPort = 3000
) => {
  return new Promise((resolve, reject) => {
    docker.createContainer(
      {
        Image: imageTag,
        name: containerName,
        Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
        ExposedPorts: { [`${containerPort}/tcp`]: {} },
        HostConfig: {
          PortBindings: {
            [`${containerPort}/tcp`]: [
              { HostPort: String(hostPort || 0) },
            ],
          },
        },
      },
      (err, container) => {
        if (err) return reject(err);

        container.start((startError) => {
          if (startError) return reject(startError);
          resolve({ container, id: container.id });
        });
      }
    );
  });
};

exports.stopContainer = async (containerId) => {
  const container = docker.getContainer(containerId);

  try {
    await container.stop();
  } catch (err) {
    if (err.statusCode !== 304 && err.statusCode !== 404) {
      throw err;
    }
  }

  try {
    await container.remove();
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
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

exports.getContainerMemoryLimitMB = async (containerId) => {
  const container = docker.getContainer(containerId);
  const info = await container.inspect();
  const bytes = Number(info.HostConfig?.Memory) || 0;

  return bytes > 0 ? Math.round(bytes / (1024 * 1024)) : null;
};

exports.getContainerLogs = (containerId, tail = "all") => {
  return new Promise((resolve, reject) => {
    const container = docker.getContainer(containerId);

    container.logs(
      {
        stdout: true,
        stderr: true,
        tail,
        follow: false,
      },
      (err, stream) => {
        if (err) return reject(err);

        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () =>
          resolve(Buffer.concat(chunks).toString())
        );
        stream.on("error", reject);
      }
    );
  });
};

exports.getFreePort = () => {
  return new Promise((resolve, reject) => {
    docker.listContainers((err, containers) => {
      if (err) return reject(err);

      const usedPorts = new Set();

      containers.forEach((container) => {
        (container.Ports || []).forEach((port) => {
          if (port.PublicPort) usedPorts.add(port.PublicPort);
        });
      });

      let port = 4000;
      while (usedPorts.has(port)) port++;

      resolve(port);
    });
  });
};
