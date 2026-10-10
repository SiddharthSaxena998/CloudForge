
const Container = require("../models/Container");
const Project = require("../models/Project");
const Deployment = require("../models/Deployment");

const {
  isContainerRunning,
  getContainerState,
  getContainerStats,
  getContainerMemoryLimitMB,
  stopContainer: stopDockerContainer,
  deleteContainer: deleteDockerContainer,
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
  container.cpuUsagePercent = stats.cpuUsagePercent;
  container.memoryUsageMB = stats.memoryUsageMB;
  container.memoryLimitMB =
    stats.memoryLimitMB ||
    await getContainerMemoryLimitMB(container.containerId);
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
    }).select("_id status");

    const projectIds = projects.map((project) => project._id);

    const containers = await Container.find({
      project: { $in: projectIds },
    });

    const buildingDeployments = await Deployment.find({
      project: { $in: projectIds },
      status: { $in: ["pending", "building"] },
    }).select("project");
    const buildingProjectIds = new Set(
      buildingDeployments.map((deployment) => String(deployment.project))
    );
    const runningProjectIds = new Set();
    const unknownProjectIds = new Set();

    for (const container of containers) {
      const projectId = String(container.project);

      try {
        const dockerState = await getContainerState(container.containerId);
        const nextStatus = dockerState.running
          ? "running"
          : container.status === "running"
            ? "stopped"
            : container.status;

        if (dockerState.running) {
          runningProjectIds.add(projectId);
        } else if (nextStatus === "stopped") {
          container.cpuUsagePercent = 0;
          container.memoryUsageMB = 0;
        }

        if (container.status !== nextStatus) {
          container.status = nextStatus;
        }

        if (
          container.isModified("status") ||
          container.isModified("cpuUsagePercent") ||
          container.isModified("memoryUsageMB")
        ) {
          container.lastCheckedAt = new Date();
          await container.save();
        }
      } catch (error) {
        // A deleted Docker object is safely treated as stopped. Other Docker
        // errors leave the project status untouched to avoid false negatives.
        if (error.statusCode === 404 || error.status === 404) {
          if (container.status === "running") {
            container.status = "stopped";
            container.cpuUsagePercent = 0;
            container.memoryUsageMB = 0;
            container.lastCheckedAt = new Date();
            await container.save();
          }
        } else {
          unknownProjectIds.add(projectId);
          console.error(
            `Container state check failed for ${container._id}:`,
            error.message
          );
        }
      }
    }

    for (const project of projects) {
      const projectId = String(project._id);
      let nextStatus;

      if (runningProjectIds.has(projectId)) {
        nextStatus = "running";
      } else if (buildingProjectIds.has(projectId)) {
        nextStatus = "building";
      } else if (unknownProjectIds.has(projectId)) {
        continue;
      } else {
        nextStatus = "stopped";
      }

      if (project.status !== nextStatus) {
        await Project.updateOne(
          { _id: project._id, owner: req.user._id },
          { $set: { status: nextStatus } }
        );
      }
    }

    await Container.populate(containers, [
      { path: "project", select: "name" },
      { path: "deployment", select: "status" },
    ]);

    res.json(containers);
  } catch (error) {
    next(error);
  }
};

async function syncProjectStatuses() {
  const projects = await Project.find({
    status: { $in: ["running", "building"] },
  }).select("_id status");

  for (const project of projects) {
    const deployments = await Deployment.find({
      project: project._id,
      status: { $in: ["running", "building", "pending"] },
    });

    let hasRunning = false;
    let hasBuilding = false;
    let hasUnknownDockerState = false;

    for (const deployment of deployments) {
      if (deployment.status === "building" || deployment.status === "pending") {
        hasBuilding = true;
        continue;
      }

      const container = await Container.findOne({
        deployment: deployment._id,
      });

      let running = false;
      if (container) {
        try {
          running = await isContainerRunning(container.containerId);
        } catch (error) {
          hasUnknownDockerState = true;
          console.error(
            `Project status check failed for container ${container._id}:`,
            error.message
          );
          continue;
        }
      }

      if (running) {
        hasRunning = true;

        if (container.status !== "running") {
          container.status = "running";
          await container.save();
          broadcastStats(container, { status: "running" });
        }
      } else {
        deployment.status = "stopped";
        deployment.finishedAt = new Date();
        await deployment.save();

        if (container) {
          container.status = "stopped";
          container.cpuUsagePercent = 0;
          container.memoryUsageMB = 0;
          container.lastCheckedAt = new Date();
          await container.save();
          broadcastStats(container, { status: "stopped" });
        }
      }
    }

    // Keep the current project status if Docker could not verify any deployment.
    if (hasUnknownDockerState) continue;

    const status = hasRunning
      ? "running"
      : hasBuilding
        ? "building"
        : "stopped";

    if (project.status !== status) {
      await Project.updateOne(
        { _id: project._id },
        { $set: { status } }
      );
    }
  }
}

exports.stopContainer = async (req, res, next) => {
  try {
    const container = await findOwnedContainer(req);

    if (!container) {
      return res.status(404).json({
        message: "Container not found",
      });
    }

    // Stop the actual Docker container before changing persisted state.
    await stopDockerContainer(container.containerId);

    container.status = "stopped";
    container.cpuUsagePercent = 0;
    container.memoryUsageMB = 0;
    container.lastCheckedAt = new Date();

    await container.save();

    if (container.deployment) {
      await Deployment.findByIdAndUpdate(container.deployment, {
        $set: {
          status: "stopped",
          finishedAt: new Date(),
        },
      });
    }

    const activeDeployment = await Deployment.exists({
      project: container.project,
      status: { $in: ["running", "building"] },
    });

    if (!activeDeployment) {
      await Project.updateOne(
        { _id: container.project },
        { $set: { status: "stopped" } }
      );
    }

    broadcastStats(container, { status: "stopped" });

    return res.json({
      success: true,
      message: "Container and deployment stopped",
    });
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

      await syncProjectStatuses();
    } catch (error) {
      console.error("Container stats broadcast failed:", error.message);
    } finally {
      polling = false;
    }
  };

  void poll();
  return setInterval(() => void poll(), 5000);
};

exports.deleteContainer = async (req, res, next) => {
  try {
    const container = await findOwnedContainer(req);

    if (!container) {
      return res.status(404).json({ message: "Container not found" });
    }

    if (container.status !== "stopped") {
      return res.status(409).json({
        message: "Only stopped containers can be deleted",
      });
    }

    // Remove actual Docker resource first.
    await deleteDockerContainer(container.containerId);

    // Clean up the database record only after Docker removal succeeds.
    await Container.deleteOne({ _id: container._id });

    return res.json({
      success: true,
      message: "Container deleted successfully",
      id: String(container._id),
    });
  } catch (error) {
    next(error);
  }
};
