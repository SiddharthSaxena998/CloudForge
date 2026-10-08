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

// Frontend ko { time, level, text } chahiye
logSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    return {
      time: new Date(ret.timestamp).toISOString().slice(11, 19), // HH:MM:SS (UTC)
      level: ret.level,
      text: ret.message,
    };
  },
});

module.exports = mongoose.model('Log', logSchema);