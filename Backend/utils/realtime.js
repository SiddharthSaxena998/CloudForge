/**
 * Real-time (Socket.IO) helpers.
 *
 * Rooms:
 *   user-<userId>              container metrics for that user's containers
 *   deployment-<deploymentId>  live build/run logs + status of one deployment
 * Only the owner of a deployment may join its room (see canJoinDeployment).
 */
const mongoose = require('mongoose');

const userRoom = (userId) => `user-${userId}`;
const deploymentRoom = (deploymentId) => `deployment-${deploymentId}`;

/** Same shape the REST endpoint returns (Log.toJSON): { id, time, level, text } */
const toLogLine = (doc) => ({
  id: String(doc._id),
  time: new Date(doc.timestamp).toISOString().slice(11, 19), // HH:MM:SS (UTC)
  level: doc.level,
  text: doc.message,
});

const emitToRoom = (room, event, payload) => {
  try {
    if (global.io) global.io.to(room).emit(event, payload);
  } catch (error) {
    console.error(`Socket emit failed (${event}):`, error.message);
  }
};

const emitDeploymentLog = (deploymentId, logDoc) =>
  emitToRoom(deploymentRoom(deploymentId), 'deployment-log', {
    deploymentId: String(deploymentId),
    ...toLogLine(logDoc),
  });

const emitDeploymentStatus = (deploymentId, status) =>
  emitToRoom(deploymentRoom(deploymentId), 'deployment-status', {
    deploymentId: String(deploymentId),
    status,
  });

/** Owner (or admin) check used before a socket may join a deployment room. */
async function canJoinDeployment(user, deploymentId) {
  if (!user || !mongoose.isValidObjectId(deploymentId)) return false;

  const Deployment = require('../models/Deployment');
  const Project = require('../models/Project');

  const deployment = await Deployment.findById(deploymentId).select('project');
  if (!deployment) return false;
  if (user.role === 'admin') return true;

  return Boolean(await Project.exists({ _id: deployment.project, owner: user._id }));
}

module.exports = {
  userRoom,
  deploymentRoom,
  toLogLine,
  emitToRoom,
  emitDeploymentLog,
  emitDeploymentStatus,
  canJoinDeployment,
};
