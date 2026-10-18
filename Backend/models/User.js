const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // blocked users cannot log in, call the API or keep apps running (set by an admin)
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active'
  },
  // admin-set exceptions to the default quotas; null = use the default
  limitOverrides: {
    maxProjects: { type: Number, min: 0, default: null },
    maxRunningContainers: { type: Number, min: 0, default: null },
    maxDeploysPerHour: { type: Number, min: 0, default: null }
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);