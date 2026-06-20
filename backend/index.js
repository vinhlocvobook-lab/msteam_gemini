import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initializeDatabase } from './db.js';
import { startScheduler } from './services/scheduler.js';
import { initSocket } from './socket.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import taskRoutes from './routes/tasks.js';
import syncRoutes from './routes/sync.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import calendarRoutes from './routes/calendar.js';
import departmentRoutes from './routes/departments.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;

// Setup CORS
// In local development, the frontend usually runs on port 5173 (Vite).
// We enable credentials: true to allow transmitting HttpOnly refresh cookies.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('CORS Policy block. Origin not allowed.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json());
app.use(cookieParser());

// Logger middleware for debugging request inputs
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'None'}`);
  next();
});

// Bind API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api', syncRoutes); // Matches /api/webhooks/teams, /api/sync/poll-teams, etc.
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/departments', departmentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER UNHANDLED ERROR]:', err);
  res.status(500).json({
    error: 'Đã xảy ra lỗi không mong muốn trên máy chủ.',
    details: err.message
  });
});

// Bootstrap Database then Start Server
async function startServer() {
  try {
    console.log('[SYSTEM] Initializing server database bootstrap...');
    await initializeDatabase();
    
    // Start background scheduler service
    startScheduler();
    
    // Initialize Socket.io server
    initSocket(server, allowedOrigins);
    
    server.listen(PORT, () => {
      console.log(`[SYSTEM] 🚀 Synapse backend server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[SYSTEM CRITICAL] Failed to bootstrap database. Server shutting down.', err);
    process.exit(1);
  }
}

startServer();
