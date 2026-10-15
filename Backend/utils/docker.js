const Docker = require('dockerode');
const net = require('net');

const { limits } = require('../config/limits');

const docker = new Docker();

exports.buildImage = (
  tag,
  contextDir,
  dockerfile = 'Dockerfile',
  onProgress,
  buildArgs = {}
) =>
  new Promise((resolve, reject) => {
    const timeoutMs = limits().buildTimeoutMin * 60 * 1000;
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

        // Kill builds that hang or run forever (closing the stream cancels the build).
        const timer = setTimeout(() => {
          try { stream.destroy(); } catch (_) {}
          fail(new Error(`Build timed out after ${limits().buildTimeoutMin} minutes`));
        }, timeoutMs);

        const fail = (err) => {
          clearTimeout(timer);
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

          clearTimeout(timer);
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

// Under Docker Compose the backend runs in its own network namespace, so asking the OS for a
// free port would test the wrong machine. APP_PORT_RANGE (e.g. "20000-29999") makes us pick a
// port that no Docker container on the host is publishing yet.
const pickPortFromRange = async (range) => {
  const [min, max] = String(range).split('-').map(Number);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error(`Invalid APP_PORT_RANGE "${range}" (expected e.g. 20000-29999)`);
  }
  const containers = await docker.listContainers({ all: true });
  const used = new Set(
    containers.flatMap((c) => (c.Ports || []).map((p) => p.PublicPort).filter(Boolean))
  );
  for (let i = 0; i < 100; i += 1) {
    const port = min + Math.floor(Math.random() * (max - min + 1));
    if (!used.has(port)) return port;
  }
  throw new Error('No free port left in APP_PORT_RANGE');
};

exports.getFreePort = () =>
  process.env.APP_PORT_RANGE
    ? pickPortFromRange(process.env.APP_PORT_RANGE)
    : getOsFreePort();

const getOsFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });

exports.runContainer = async (image, name, envVars, hostPort, containerPort) => {
  const l = limits();
  const memory = l.containerMemoryMB * 1024 * 1024;

  const container = await docker.createContainer({
    Image: image,
    name,
    Env: Object.entries(envVars || {}).map(([key, value]) => `${key}=${value}`),
    ExposedPorts: { [`${containerPort}/tcp`]: {} },
    Labels: { 'cloudforge.managed': 'true' },
    HostConfig: {
      PortBindings: {
        [`${containerPort}/tcp`]: [{ HostIp: l.containerBindHost, HostPort: String(hostPort) }],
      },
      // --- sandbox limits: one user's app must not starve or attack the host ---
      Memory: memory,
      MemorySwap: memory,                           // no swap: hard memory cap
      NanoCpus: Math.round(l.containerCpus * 1e9),  // e.g. 0.5 CPU
      PidsLimit: l.containerPids,                   // stops fork bombs
      Privileged: false,
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['NET_RAW', 'MKNOD', 'SETFCAP', 'AUDIT_WRITE'],
      LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
    },
  });
  await container.start();
  return { container, id: container.id };
};

exports.removeImage = async (tag) => {
  if (!tag) return;
  try {
    await docker.getImage(tag).remove({ force: false });
  } catch (_) {
    // image still in use, or already gone: both are fine
  }
};

/** Remove dangling (<none>) images left behind by rebuilds. Returns reclaimed bytes. */
exports.pruneDanglingImages = async () => {
  const result = await docker.pruneImages({ filters: { dangling: ['true'] } });
  return result?.SpaceReclaimed || 0;
};
