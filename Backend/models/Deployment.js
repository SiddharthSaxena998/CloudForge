const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imageTag: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'building', 'running', 'failed', 'stopped'],
    default: 'pending'
  },
  errorMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

deploymentSchema.index({ project: 1, createdAt: -1 });

module.exports = mongoose.model('Deployment', deploymentSchema);