const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['success', 'failure', 'info'], required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

// Frontend ko { id, kind, message, read, createdAt } chahiye
notificationSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    return {
      id: String(ret._id),
      kind: ret.type,
      message: ret.message,
      read: ret.read,
      createdAt: ret.createdAt,
    };
  },
});

module.exports = mongoose.model('Notification', notificationSchema);