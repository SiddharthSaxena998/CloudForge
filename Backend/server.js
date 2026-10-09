const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config();

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const deploymentRoutes = require('./routes/deployments');
const notificationRoutes = require('./routes/notifications');
const containerRoutes = require('./routes/containers');
const errorHandler = require('./middleware/error-handler');
const User = require('./models/User');
const Project = require('./models/Project');
const Deployment = require('./models/Deployment');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Socket.IO setup
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
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

const startServer = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MONGO_URI type:', process.env.MONGO_URI.startsWith('mongodb+srv://') ? 'Atlas (mongodb+srv://)' : 'Local/Other');

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    console.log('MongoDB Connected successfully');

    // Restart ke beech atke hue deployments ko failed mark karo,
    // warna project hamesha "building" rahega aur naya deploy 409 dega
    await Project.updateMany({ status: 'building' }, { $set: { status: 'failed' } });
    await Deployment.updateMany(
      { status: { $in: ['pending', 'building'] } },
      { $set: { status: 'failed', errorMessage: 'Server restarted during deployment' } }
    );

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      // Start periodic container stats broadcast (every 5 seconds)
      const { startContainerStatsBroadcast } = require('./controllers/containerController');
      startContainerStatsBroadcast();
      console.log('Container stats broadcast started (every 5 seconds)');
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

module.exports = { app, server, io, startServer };

startServer();