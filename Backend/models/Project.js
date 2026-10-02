const mongoose = require('mongoose');

const envVarSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: String,
    default: ''
  }
});

const projectSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  sourceType: {
    type: String,
    enum: ['upload', 'github'],
    required: true
  },
  repoUrl: {
    type: String,
    default: ''
  },
  branch: {
    type: String,
    default: ''
  },
  sourcePath: {
    type: String,
    default: ''
  },
  framework: {
    type: String,
    default: ''
  },
  envVars: [envVarSchema],
  status: {
    type: String,
    enum: ['active', 'building', 'failed', 'stopped'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Project', projectSchema);