
const mongoose = require("mongoose");

const containerSchema = new mongoose.Schema({
  deployment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Deployment",
    required: true,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  containerId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  hostPort: {
    type: Number,
    required: true,
  },
  containerPort: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "building", "running", "failed", "stopped"],
    default: "pending",
  },
  cpuUsagePercent: {
    type: Number,
    default: 0,
  },
  memoryUsageMB: {
    type: Number,
    default: 0,
  },
  memoryLimitMB: {
    type: Number,
    default: null,
  },
  lastCheckedAt: {
    type: Date,
    default: null,
  },
});

containerSchema.index({ project: 1 });

module.exports = mongoose.model("Container", containerSchema);
