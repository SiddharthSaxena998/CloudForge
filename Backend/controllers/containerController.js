
const Container = require("../models/Container");
const Project = require("../models/Project");

const {
  getContainerStats,
  getContainerMemoryLimitMB,
  stopContainer: stopDockerContainer,
} = require("../utils/docker");

function calculateCpuUsage(stats) {
  const current = stats?.cpu_stats;
  const previous = stats?.precpu_stats;

  if (!current || !previous) return 0;

  const currentCpu = current.cpu_usage?.total_usage;
  const previousCpu = previous.cpu_usage?.total_usage;
  const currentSystem = current.system_cpu_usage;
  const previousSystem = previous.system_cpu_usage;

  if (
    !Number.isFinite(currentCpu) ||
    !Number.isFinite(previousCpu) ||
    !Number.isFinite(currentSystem) ||
    !Number.isFinite(previousSystem)
  ) {
    return 0;
  }

  const cpuDelta = currentCpu - previousCpu;
  const systemDelta = currentSystem - previousSystem;

  const cpuCount =
    current.online_cpus ||
    current.cpu_usage?.percpu_usage?.length ||
    1;

  if (cpuDelta < 0 || systemDelta <= 0) return 0;

  return Number(((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2));
}

function calculateMemoryUsageMB(stats) {
  const memory = stats?.memory_stats;
  const usage = Number(memory?.usage) || 0;

  // Linux cgroup v1 may expose cache separately.
  const cache = Number(
    memory?.stats?.total_inactive_file ??
    memory?.stats?.inactive_file ??
    memory?.stats?.cache ??
    0
  );

  const workingSet = Math.max(0, usage - cache);
  return Math.round(workingSet / (1024 * 1024));
}

async function updateStats(container, stats) {
  container.cpuUsagePercent = calculateCpuUsage(stats);
  container.memoryUsageMB = calculateMemoryUsageMB(stats);
  container.memoryLimitMB = await getContainerMemoryLimitMB(
    container.containerId
  );
  container.lastCheckedAt = new Date();

  await container.save();
}

function broadcastStats(container, extra = {}) {
  if (!global.io) return;

  const payload = {
    containerId: String(container._id),
    cpuUsagePercent: container.cpuUsagePercent ?? 0,
    memoryUsageMB: container.memoryUsageMB ?? 0,
    memoryLimitMB: container.memoryLimitMB ?? null,
    lastCheckedAt: container.lastCheckedAt,
    status: container.status,
    ...extra,
  };

  global.io.to("containers").emit("container-stats-update", payload);

  const deploymentId =
    container.deployment?._id || container.deployment;

  if (deploymentId) {
    global.io
      .to(`deployment-${deploymentId}`)
      .emit("container-stats-update", payload);
  }
}

async function findOwnedContainer(req) {
  const projects = await Project.find({
    owner: req.user._id,
  }).select("_id");

  return Container.findOne({
    _id: req.params.id,
    project: { $in: projects.map((project) => project._id) },
  });
}

exports.getContainers = async (req, res, next) => {
  try {
    const projects = await Project.find({
      owner: req.user._id,
    }).select("_id");

    const containers = await Container.find({
      project: { $in: projects.map((project) => project._id) },
    })
      .populate("project", "name")
      .populate("deployment", "status");

    res.json(containers);
  } catch (error) {
    next(error);
  }
};

exports.stopContainer = async (req, res, next) => {
  try {
    const container = await findOwnedContainer(req);

    if (!container) {
      return res.status(404).json({ message: "Container not found" });
    }

    await stopDockerContainer(container.containerId);

    container.status = "stopped";
    container.cpuUsagePercent = 0;
    container.memoryUsageMB = 0;
    container.lastCheckedAt = new Date();

    await container.save();
    broadcastStats(container);

    res.json({ success: true, message: "Container stopped" });
  } catch (error) {
    next(error);
  }
};

exports.getContainerStats = async (req, res, next) => {
  try {
    const container = await findOwnedContainer(req);

    if (!container) {
      return res.status(404).json({ message: "Container not found" });
    }

    const stats = await getContainerStats(container.containerId);
    await updateStats(container, stats);
    broadcastStats(container);

    res.json(container);
  } catch (error) {
    next(error);
  }
};

exports.startContainerStatsBroadcast = () => {
  let polling = false;

  const poll = async () => {
    if (polling) return;
    polling = true;

    try {
      const containers = await Container.find({ status: "running" });

      for (const container of containers) {
        try {
          const stats = await getContainerStats(container.containerId);
          await updateStats(container, stats);
          broadcastStats(container);
        } catch (error) {
          console.error(
            `Stats failed for container ${container._id}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error("Container stats broadcast failed:", error.message);
    } finally {
      polling = false;
    }
  };

  void poll();
  return setInterval(() => void poll(), 5000);
};
