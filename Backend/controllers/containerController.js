const Container = require('../models/Container');
const Deployment = require('../models/Deployment');
const Project = require('../models/Project');
const { getContainerStats, stopContainer } = require('../utils/docker');

const emitUpdate = (container) => {
  if (!global.io) return;
  const payload = {
    containerId: String(container._id),
    status: container.status,
    cpuUsagePercent: container.cpuUsagePercent,
    memoryUsageMB: container.memoryUsageMB,
    lastCheckedAt: container.lastCheckedAt,
  };
  global.io.to('containers').emit('container-stats-update', payload);
  if (container.deployment) {
    global.io.to(`deployment-${container.deployment}`).emit('container-stats-update', payload);
  }
};

exports.getContainers = async (req, res, next) => {
  try {
    const projectIds = await Project.find({ owner: req.user._id }).distinct('_id');
    const containers = await Container.find({ project: { $in: projectIds } }).sort({ _id: -1 });
    res.json(containers);
  } catch (error) {
    next(error);
  }
};

exports.stopContainer = async (req, res, next) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });

    // sirf apne project ka container roka ja sakta hai
    const owns = await Project.exists({ _id: container.project, owner: req.user._id });
    if (!owns) return res.status(404).json({ message: 'Container not found' });

    try {
      await stopContainer(container.containerId);
    } catch (e) {
      if (e.statusCode !== 404) throw e; // container Docker mein pehle se nahi hai to koi dikkat nahi
    }

    container.status = 'stopped';
    container.cpuUsagePercent = 0;
    container.memoryUsageMB = 0;
    container.lastCheckedAt = new Date();
    await container.save();

    await Deployment.updateOne({ _id: container.deployment }, { $set: { status: 'stopped' } });
    const stillRunning = await Container.exists({ project: container.project, status: 'running' });
    if (!stillRunning) {
      await Project.updateOne({ _id: container.project }, { $set: { status: 'stopped' } });
    }

    emitUpdate(container);
    res.json(container);
  } catch (error) {
    next(error);
  }
};

/**
 * Har 5 second mein running containers ke live CPU/memory stats
 * MongoDB mein update karta hai aur Socket.IO se broadcast karta hai.
 */
exports.startContainerStatsBroadcast = () => {
  let busy = false;

  const tick = async () => {
    if (busy) return; // pichla round abhi chal raha hai to overlap mat karo
    busy = true;
    try {
      const containers = await Container.find({ status: 'running' });

      for (const container of containers) {
        try {
          const stats = await getContainerStats(container.containerId);

          const cpuDelta =
            (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
            (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
          const systemDelta =
            (stats.cpu_stats?.system_cpu_usage ?? 0) -
            (stats.precpu_stats?.system_cpu_usage ?? 0);
          const cpus = stats.cpu_stats?.online_cpus || 1;

          let cpu = 0;
          if (systemDelta > 0 && cpuDelta > 0) cpu = (cpuDelta / systemDelta) * cpus * 100;

          const mem = stats.memory_stats || {};
          const cache = mem.stats?.inactive_file ?? mem.stats?.cache ?? 0;
          const usedBytes = Math.max(0, (mem.usage ?? 0) - cache);

          container.cpuUsagePercent = Math.round(cpu * 10) / 10;
          container.memoryUsageMB = Math.round(usedBytes / 1024 / 1024);
          if (mem.limit) container.memoryLimitMB = Math.round(mem.limit / 1024 / 1024);
          container.lastCheckedAt = new Date();
          await container.save();

          emitUpdate(container);
        } catch (err) {
          console.error(`Stats error for container ${container._id}:`, err.message);
          // sirf tab stopped mark karo jab container Docker mein sach mein nahi hai
          if (err.statusCode === 404) {
            container.status = 'stopped';
            await container.save();
            emitUpdate(container);
          }
        }
      }
    } catch (error) {
      console.error('Error in container stats broadcast:', error.message);
    } finally {
      busy = false;
    }
  };

  tick();
  return setInterval(tick, 5000);
};