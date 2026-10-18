const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Project = require('../models/Project');
const Container = require('../models/Container');
const Deployment = require('../models/Deployment');
const { isValidEmail } = require('../utils/validators');
const { limitsFor, isExempt } = require('../config/limits');

// Optional invite code: when SIGNUP_CODE is set in .env, only people who know it can register.
const signupCode = () => String(process.env.SIGNUP_CODE || '').trim();
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Public: lets the sign-up form know whether to ask for an invite code. */
exports.getConfig = (req, res) => {
  res.json({ inviteRequired: Boolean(signupCode()) });
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, inviteCode } = req.body;

    if (signupCode() && !safeEqual(typeof inviteCode === 'string' ? inviteCode.trim() : '', signupCode())) {
      return res.status(403).json({ message: 'Invalid invite code. Ask the administrator for the code.' });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if ([name, email, password].some((v) => typeof v !== 'string')) {
      return res.status(400).json({ message: 'Name, email, and password must be text' });
    }

    if (name.trim().length < 2 || name.length > 80) {
      return res.status(400).json({ message: 'Name must be 2-80 characters' });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({ message: 'Enter a valid email address' });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: 'Password must be 8-128 characters' });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim(),
      password
    });

    const token = jwt.sign(
      { _id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password must be text' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ message: 'Your account has been blocked. Contact the administrator.' });
    }

    const token = jwt.sign(
      { _id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ user, token });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

/** The signed-in user's quota usage (shown on the dashboard). */
exports.getUsage = async (req, res, next) => {
  try {
    const l = limitsFor(req.user);
    const projectIds = await Project.find({ owner: req.user._id }).distinct('_id');
    const [running, lastHour] = await Promise.all([
      Container.countDocuments({ project: { $in: projectIds }, status: 'running' }),
      Deployment.countDocuments({
        triggeredBy: req.user._id,
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      }),
    ]);
    res.json({
      unlimited: isExempt(req.user),
      projects: { used: projectIds.length, max: l.maxProjects },
      runningApps: { used: running, max: l.maxRunningContainers },
      deploysPerHour: { used: lastHour, max: l.maxDeploysPerHour },
    });
  } catch (error) {
    next(error);
  }
};
