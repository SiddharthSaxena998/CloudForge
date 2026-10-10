const Docker = require('dockerode');
const net = require('net');

const docker = new Docker();

exports.buildImage = (
  tag,
  contextDir,
  dockerfile = 'Dockerfile',
  onProgress,
  buildArgs = {}
) =>
  new Promise((resolve, reject) => {
    docker.buildImage(
      {
        context: contextDir,
        src: ['.'],
        dockerfile,
      },
      { t: tag, buildargs: buildArgs },
      (error, stream) => {
        if (error) return reject(error);

        let output = '';
        let settled = false;

        const fail = (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        };

        stream.on('data', (chunk) => {
          const text = chunk.toString();
          process.stdout.write(text);

          // Docker emits newline-delimited JSON messages.
          output += text;

          const lines = output.split('\n');
          output = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const message = JSON.parse(line);

              if (message.stream && onProgress) {
                const progressText = message.stream
                  .replace(/\u001b\[[0-9;]*m/g, '')
                  .replace(/\r/g, '\n');
                for (const progressLine of progressText.split('\n')) {
                  const trimmedLine = progressLine.trim();
                  if (trimmedLine) onProgress(trimmedLine);
                }
              }

              if (message.error || message.errorDetail?.message) {
                fail(
                  new Error(
                    message.errorDetail?.message ||
                    message.error
                  )
                );
                return;
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) continue;
              fail(parseError);
              return;
            }
          }
        });

        stream.on('end', () => {
          if (settled) return;

          if (output.trim()) {
            try {
              const message = JSON.parse(output);

              if (message.stream && onProgress) {
                const trimmedLine = message.stream
                  .replace(/\u001b\[[0-9;]*m/g, '')
                  .trim();
                if (trimmedLine) onProgress(trimmedLine);
              }

              if (message.error || message.errorDetail?.message) {
                return fail(
                  new Error(
                    message.errorDetail?.message ||
                    message.error
                  )
                );
              }
            } catch (_) {}
          }

          settled = true;
          resolve();
        });

        stream.on('error', fail);
      }
    );
  });

exports.getContainerStats = async (containerId) => {
  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });

  const memoryUsageBytes = stats.memory_stats?.usage || 0;
  const memoryLimitBytes = stats.memory_stats?.limit || 0;
  const cpuDelta =
    (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
    (stats.precpu_stats?.cpu_usage?.total_usage || 0);
  const systemDelta =
    (stats.cpu_stats?.system_cpu_usage || 0) -
    (stats.precpu_stats?.system_cpu_usage || 0);
  const cpuCount =
    stats.cpu_stats?.online_cpus ||
    stats.cpu_stats?.cpu_usage?.percpu_usage?.length ||
    1;
  const cpuUsagePercent =
    systemDelta > 0 && cpuDelta >= 0
      ? (cpuDelta / systemDelta) * cpuCount * 100
      : 0;

  return {
    cpuUsagePercent: Number(cpuUsagePercent.toFixed(2)),
    memoryUsageMB: Number((memoryUsageBytes / (1024 * 1024)).toFixed(2)),
    memoryLimitMB: Number((memoryLimitBytes / (1024 * 1024)).toFixed(2)),
  };
};

exports.getContainerMemoryLimitMB = async (containerId) => {
  const info = await docker.getContainer(containerId).inspect();
  const memoryLimitBytes = info.HostConfig?.Memory || 0;
  return memoryLimitBytes > 0
    ? Number((memoryLimitBytes / (1024 * 1024)).toFixed(2))
    : null;
};

exports.stopContainer = async (containerId) => {
  const container = docker.getContainer(containerId);
  const info = await container.inspect();
  if (info.State?.Running) await container.stop();
};

exports.getContainerState = async (containerId) => {
  const info = await docker.getContainer(containerId).inspect();
  return {
    running: Boolean(info.State?.Running),
    status: info.State?.Status || 'unknown',
  };
};

exports.isContainerRunning = async (containerId) => {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State?.Running === true;
  } catch (error) {
    if (error.statusCode === 404) return false;
    throw error;
  }
};

exports.assertContainerStopped = async (containerId) => {
  const container = docker.getContainer(containerId);
  const info = await container.inspect();

  if (info.State?.Running) {
    const error = new Error("Stop the container before deleting it");
    error.statusCode = 409;
    throw error;
  }
};

exports.deleteContainer = async (containerId) => {
  const container = docker.getContainer(containerId);
  await exports.assertContainerStopped(containerId);
  await container.remove({ force: false });
};

exports.getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });

exports.runContainer = async (image, name, envVars, hostPort, containerPort) => {
  const container = await docker.createContainer({
    Image: image,
    name,
    Env: Object.entries(envVars || {}).map(([key, value]) => `${key}=${value}`),
    ExposedPorts: { [`${containerPort}/tcp`]: {} },
    HostConfig: {
      PortBindings: {
        [`${containerPort}/tcp`]: [{ HostPort: String(hostPort) }],
      },
    },
  });
  await container.start();
  return { container, id: container.id };
};
