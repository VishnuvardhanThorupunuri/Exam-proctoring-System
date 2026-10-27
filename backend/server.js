const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const socketHandler = require('./sockets/socketHandler');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
app.set('io', io);

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const mongoose = require('mongoose');

// Database connection
connectDB();

// Rest API Routes
app.get('/api/health', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = dbStates[mongoose.connection.readyState] || 'unknown';
  res.json({
    status: 'ok',
    database: state,
    databaseHost: mongoose.connection.host || null,
    timestamp: new Date()
  });
});

// Database readiness middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState === 0) {
        connectDB();
      }
      return res.status(503).json({
        error: 'Database connection is initializing. Please try again in a few moments.'
      });
    }
  }
  next();
});

// Import route groups
const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');

// Mount routes
app.use('/api', authRoutes); // Auth and Roles
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);

// Socket Logic
socketHandler(io);

// Start Server
server.listen(PORT, () => {
  console.log(`Proctoring Server running on port ${PORT}`);
});
