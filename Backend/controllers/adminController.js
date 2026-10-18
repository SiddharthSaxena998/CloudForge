/**
 * Admin: list users with their usage, change role / status (block) / quota overrides.
 */
const User = require('../models/User');
const Project = require('../models/Project');
const Container = require('../models/Container');
const Deployment = require('../models/Deployment');
const { OVERRIDABLE } = require('../config/limits');
const { invalidateUser } = require('../utils/userCache');
const { stopContainer: stopDockerContainer } = require('../utils/docker');
const { stopTunnel } = require('../utils/tunnel');
const { emitDeploymentStatus } = require('../utils/realtime');

const MAX_OVERRIDE = 1000;

const bad = (res, message, status = 400) => res.status(status).json({ message });

exports.listUsers = async (req, res, next) => {
  try {
    const [users, projects, running] = await Promise.all([
      User.find().sort({ createdAt: -1 }),
      Project.find().select('owner').lean(),
      Container.find({ status: 'running' }).select('project').lean(),
    ]);

    const ownerOf = new Map(projects.map((p) => [String(p._id), String(p.owner)]));
    const projectCount = new Map();
    const runningCount = new Map();
    for (const p of projects) {
      const k = String(p.owner);
      projectCount.set(k, (projectCount.get(k) || 0) + 1);
    }
    for (const c of running) {
      const owner = ownerOf.get(String(c.project));
      if (owner) runningCount.set(owner, (runningCount.get(owner) || 0) + 1);
    }

    res.json(
      users.map((u) => ({
        ...u.toJSON(),
        joinedAt: u.createdAt,
        usage: {
          projects: projectCount.get(String(u._id)) || 0,
          runningApps: runningCount.get(String(u._id)) || 0,
        },
      }))
    );
  } catch (error) {
    next(error);
  }
};

/** Stops every running app of a user (used when blocking). Returns how many were stopped. */
async function stopAllForUser(userId) {
  const projectIds = await Project.find({ owner: userId }).distinct('_id');
  const containers = await Container.find({ project: { $in: projectIds }, status: 'running' });

  for (const c of containers) {
    stopTunnel(c._id);
    try {
      await stopDockerContainer(c.containerId);
    } catch (error) {
      if (error.statusCode !== 404) console.error('Could not stop container of blocked user:', error.message);
    }
    c.status = 'stopped';
    c.publicUrl = '';
    c.cpuUsagePercent = 0;
    c.memoryUsageMB = 0;
    await c.save();
    if (c.deployment) {
      await Deployment.updateOne(
        { _id: c.deployment, status: 'running' },
        { $set: { status: 'stopped', finishedAt: new Date(), publicUrl: '' } }
      );
      emitDeploymentStatus(c.deployment, 'stopped');
    }
  }
  await Project.updateMany({ owner: userId, status: 'running' }, { $set: { status: 'stopped' } });
  return containers.length;
}

/** Closes the live (Socket.IO) connections of a user. */
function disconnectSockets(userId) {
  const io = global.io;
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    if (String(socket.user?._id) === String(userId)) socket.disconnect(true);
  }
}

exports.updateUser = async (req, res, next) => {
  try {
    const { role, status, limitOverrides } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) return bad(res, 'User not found', 404);

    const isSelf = String(user._id) === String(req.user._id);
    const changesRole = role !== undefined && role !== user.role;
    const changesStatus = status !== undefined && status !== user.status;

    if (role !== undefined && !['user', 'admin'].includes(role)) return bad(res, 'Role must be "user" or "admin".');
    if (status !== undefined && !['active', 'blocked'].includes(status)) return bad(res, 'Status must be "active" or "blocked".');

    if (isSelf && (changesRole || changesStatus)) {
      return bad(res, 'You cannot change your own role or block yourself.', 409);
    }

    // never leave the platform without an active admin
    const losesAdmin = user.role === 'admin' && (role === 'user' || status === 'blocked');
    if (losesAdmin) {
      const others = await User.countDocuments({ _id: { $ne: user._id }, role: 'admin', status: { $ne: 'blocked' } });
      if (others === 0) return bad(res, 'At least one active admin must remain.', 409);
    }

    if (limitOverrides !== undefined) {
      if (typeof limitOverrides !== 'object' || limitOverrides === null) return bad(res, 'limitOverrides must be an object.');
      for (const key of OVERRIDABLE) {
        if (!(key in limitOverrides)) continue;
        const v = limitOverrides[key];
        if (v === null || v === '') {
          user.set(`limitOverrides.${key}`, null); // back to the default
        } else if (Number.isInteger(v) && v >= 0 && v <= MAX_OVERRIDE) {
          user.set(`limitOverrides.${key}`, v);
        } else {
          return bad(res, `${key} must be a whole number between 0 and ${MAX_OVERRIDE}, or empty for the default.`);
        }
      }
    }

    if (role !== undefined) user.role = role;
    if (status !== undefined) user.status = status;
    await user.save();
    invalidateUser(user._id);

    let stopped = 0;
    if (changesStatus && status === 'blocked') {
      stopped = await stopAllForUser(user._id);
      disconnectSockets(user._id);
    }

    res.json({ ...user.toJSON(), joinedAt: user.createdAt, stoppedApps: stopped });
  } catch (error) {
    next(error);
  }
};

exports.stopAllForUser = stopAllForUser;
