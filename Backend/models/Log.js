const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  deployment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deployment',
    required: true
  },
  level: {
    type: String,
    enum: ['info', 'warn', 'error', 'success'],
    default: 'info'
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

logSchema.index({ deployment: 1, timestamp: 1 });

module.exports = mongoose.model('Log', logSchema);