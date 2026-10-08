const Container = require('../models/Container');
const { getContainerStats, stopContainer } = require('../utils/docker');
const Project = require('../models/Project');

exports.getContainers = async (req, res, next) => {
  try {
    const projects = await Project.find({ owner: req.user._id }).select('_id');
    const projectIds = projects.map(p => p._id);

    const containers = await Container.find({ project: { $in: projectIds } })
      .populate('project', 'name')
      .populate('deployment', 'status');

    res.json(containers);
  } catch (error) {
    next(error);
  }
};

exports.stopContainer = async (req, res, next) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) {
      return res.status(404).json({ message: 'Container not found' });
    }

    // Update status first
    container.status = 'stopped';
    await container.save();

    await stopContainer(container.containerId);

    // Broadcast stop event
    if (global.io) {
      global.io.to('containers').emit('container-stats-update', {
        containerId: container._id,
        status: 'stopped',
        cpuUsagePercent: 0,
        memoryUsageMB: 0
      });
    }

    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    next(error);
  }
};

exports.getContainerStats = async (req, res, next) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) {
      return res.status(404).json({ message: 'Container not found' });
    }

    const stats = await getContainerStats(container.containerId);

    container.cpuUsagePercent = stats.cpu_stats?.usages?.user || 0;
    container.memoryUsageMB = stats.memory_stats?.usage || 0;
    container.lastCheckedAt = new Date();
    await container.save();

    // Broadcast to clients via Socket.IO
    if (global.io) {
      global.io.to('containers').emit('container-stats-update', {
        containerId: container._id,
        cpuUsagePercent: container.cpuUsagePercent,
        memoryUsageMB: container.memoryUsageMB,
        lastCheckedAt: container.lastCheckedAt
      });

      if (container.deployment) {
        global.io.to(`deployment-${container.deployment}`).emit('container-stats-update', {
          containerId: container._id,
          cpuUsagePercent: container.cpuUsagePercent,
          memoryUsageMB: container.memoryUsageMB,
          lastCheckedAt: container.lastCheckedAt
        });
      }
    }

    res.json(container);
  } catch (error) {
    next(error);
  }
};

exports.stopContainer = async (req, res, next) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) {
      return res.status(404).json({ message: 'Container not found' });
    }

    // Update status first
    container.status = 'stopped';
    await container.save();

    await stopContainer(container.containerId);

    // Broadcast stop event
    if (global.io) {
      global.io.to('containers').emit('container-stats-update', {
        containerId: container._id,
        status: 'stopped',
        cpuUsagePercent: 0,
        memoryUsageMB: 0
      });
    }

    res.json({ success: true, message: 'Container stopped' });
  } catch (error) {
    next(error);
  }
};

/**
 * Start broadcasting container stats every 5 seconds
 * Fetches live CPU/Memory stats for all running containers via dockerode
 * Updates Container documents in MongoDB
 * Emits "container-stats-update" via Socket.IO to the "containers" room
 */
exports.startContainerStatsBroadcast = () => {
  // Run immediately on start, then every 5 seconds
  const broadcastContainerStats = async () => {
    try {
      // Find all containers with status 'running'
      const containers = await Container.find({ status: 'running' });

      for (const container of containers) {
        try {
          // Get fresh stats from docker
          const stats = await getContainerStats(container.containerId);

          // Calculate CPU percentage (more accurate calculation)
          let cpuUsagePercent = 0;
          if (stats.cpu_stats && stats.precpu_stats) {
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
            if (systemDelta > 0) {
              cpuUsagePercent = (cpuDelta / systemDelta) * 100.0;
            }
          }

          // Memory usage in MB
          const memoryUsageMB = stats.memory_stats ? Math.round(stats.memory_stats.usage / 1024 / 1024) : 0;

          // Update container document
          container.cpuUsagePercent = cpuUsagePercent;
          container.memoryUsageMB = memoryUsageMB;
          container.lastCheckedAt = new Date();
          await container.save();

          // Broadcast to clients via Socket.IO
          if (global.io) {
            global.io.to('containers').emit('container-stats-update', {
              containerId: container._id,
              cpuUsagePercent: container.cpuUsagePercent,
              memoryUsageMB: container.memoryUsageMB,
              lastCheckedAt: container.lastCheckedAt
            });

            if (container.deployment) {
              global.io.to(`deployment-${container.deployment}`).emit('container-stats-update', {
                containerId: container._id,
                cpuUsagePercent: container.cpuUsagePercent,
                memoryUsageMB: container.memoryUsageMB,
                lastCheckedAt: container.lastCheckedAt
              });
            }
          }
        } catch (containerError) {
          // Log error for individual container but continue with others
          console.error(`Error updating stats for container ${container._id}:`, containerError.message);
          // Optionally mark container as error state if Docker is unreachable
          if (containerError.message && (containerError.message.includes('Cannot connect') || containerError.message.includes('No such container'))) {
            container.status = 'failed';
            await container.save();
          }
        }
      }
    } catch (error) {
      console.error('Error in container stats broadcast:', error);
    }
  };

  // Run immediately, then every 5 seconds
  broadcastContainerStats();
  return setInterval(broadcastContainerStats, 5000);
};