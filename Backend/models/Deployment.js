const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageTag: { type: String, required: true },

    status: {
      type: String,
      enum: ['pending', 'building', 'running', 'failed', 'stopped'],
      default: 'pending',
    },

    source: { type: String, default: '' },
    commit: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    finishedAt: { type: Date, default: null },

    // Deployed app ports
    hostPort: { type: Number, default: null },
containerPort: { type: Number, default: null },
deploymentUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

deploymentSchema.index({ project: 1, createdAt: -1 });

deploymentSchema.set('toJSON', {
  versionKey: false,

  transform(_doc, ret) {
    ret.id = String(ret._id);
    ret.projectId = String(ret.project);

    // frontend ke paas pending status nahi hai
    ret.status = ret.status === 'pending' ? 'building' : ret.status;

    ret.commit = ret.commit || '—';

    delete ret._id;
    delete ret.project;
    delete ret.triggeredBy;
    delete ret.imageTag;

    return ret;
  },
});

module.exports = mongoose.model('Deployment', deploymentSchema);