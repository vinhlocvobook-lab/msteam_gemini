import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

const APP_JWT_SECRET = process.env.APP_JWT_SECRET || 'default_app_jwt_secret_key_12345';

export function initSocket(server, allowedOrigins) {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    // Authenticate token
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: Token is required'));
    }

    try {
      const decoded = jwt.verify(token, APP_JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      console.error('[SOCKET AUTH ERROR] JWT verification failed:', err.message);
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`[SOCKET] User connected: ${userId} (Socket ID: ${socket.id})`);

    // Join room for this user to support multiple devices (same userId room)
    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${userId} (Socket ID: ${socket.id})`);
    });
  });

  return io;
}

export function sendRealtimeNotification(userId, notification) {
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
    console.log(`[SOCKET] Dispatched real-time notification to user:${userId}`);
  } else {
    console.warn('[SOCKET WARNING] Socket.io is not initialized yet. Cannot send real-time notification.');
  }
}
