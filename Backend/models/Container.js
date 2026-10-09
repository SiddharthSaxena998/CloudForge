const mongoose = require('mongoose');

const containerSchema = new mongoose.Schema({
  deployment: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  containerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  hostPort: { type: Number, required: true },
  containerPort: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'building', 'running', 'failed', 'stopped'],
    default: 'pending',
  },
  cpuUsagePercent: { type: Number, default: 0 },
  memoryUsageMB: { type: Number, default: 0 },
  memoryLimitMB: { type: Number, default: 512 },
  lastCheckedAt: { type: Date, default: null },
});

containerSchema.index({ project: 1 });

// Frontend ko { id, projectId, name, status, cpu, memoryMb, memoryLimitMb, url } chahiye
containerSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    return {
      id: String(ret._id),
      projectId: String(ret.project?._id ?? ret.project),
      deploymentId: String(ret.deployment?._id ?? ret.deployment),
      name: ret.name,
      status: ret.status === 'pending' ? 'building' : ret.status,
      cpu: Number(ret.cpuUsagePercent) || 0,
      memoryMb: Math.round(ret.memoryUsageMB) || 0,
      memoryLimitMb: Math.round(ret.memoryLimitMB) || 512,
      url: `http://${process.env.APP_HOST || 'localhost'}:${ret.hostPort}`,
    };
  },
});

module.exports = mongoose.model('Container', containerSchema);