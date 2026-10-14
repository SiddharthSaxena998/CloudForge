const express = require('express');
const { validateEnv, applySecurity, isOriginAllowed, authLimiter, apiLimiter } = require('./config/security');
const mongoose = require('mongoose');
const http = require('http');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const deploymentRoutes = require('./routes/deployments');
const notificationRoutes = require('./routes/notifications');
const containerRoutes = require('./routes/containers');
const errorHandler = require('./middleware/error-handler');
const Notification = require('./models/Notification');
const User = require('./models/User');
const Container = require('./models/Container');
const Deployment = require('./models/Deployment');
const { startTunnel, stopAllTunnels } = require('./utils/tunnel');

dotenv.config();
validateEnv();

const app = express();
const server = http.createServer(app);

// Middleware
applySecurity(app); // helmet + CORS allow-list (+ trust proxy if TRUST_PROXY is set)
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Socket.IO setup
const io = require('socket.io')(server, {
  cors: {
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST']
  }
});

// Only logged-in users may open a socket: client sends io(url, { auth: { token } })
io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    next(new Error('Unauthorized'));
  }
});

global.io = io;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-deployment', (deploymentId) => {
    socket.join(`deployment-${deploymentId}`);
  });

  socket.on('join-containers', () => {
    socket.join('containers');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/containers', containerRoutes);

// Helper middleware for inline admin routes
function authenticateInline(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

function roleCheckAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
}

// Admin routes (inline for now)
app.get('/api/admin/users', authenticateInline, roleCheckAdmin, async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/users/:id', authenticateInline, roleCheckAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Quick-tunnel URLs die with the backend process, so on startup re-create a
// fresh public link for every container that is still running.
async function restoreTunnels() {
  const running = await Container.find({ status: 'running' });
  for (const c of running) {
    const { url } = await startTunnel(c._id, c.hostPort);
    c.publicUrl = url || '';
    await c.save();
    if (c.deployment) {
      await Deployment.updateOne({ _id: c.deployment }, { $set: { publicUrl: url || '' } });
    }
    if (url) console.log(`Public link for ${c.name}: ${url}`);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { stopAllTunnels(); process.exit(0); });
}
process.on('exit', stopAllTunnels);

const startServer = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MONGO_URI type:', process.env.MONGO_URI.startsWith('mongodb+srv://') ? 'Atlas (mongodb+srv://)' : 'Local/Other');

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    console.log('MongoDB Connected successfully');

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      // Start periodic container stats broadcast (every 5 seconds)
      const { startContainerStatsBroadcast } = require('./controllers/containerController');
      startContainerStatsBroadcast();
      console.log('Container stats broadcast started (every 5 seconds)');

      restoreTunnels().catch((e) => console.error('Tunnel restore failed:', e.message));
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

module.exports = { app, server, io, startServer };

startServer();