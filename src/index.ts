import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/environment';
import { getConnectionInfo, testConnection } from './config/database';
import { configService } from './config/supervisorConfig';

// Import routes
import authRoutes from './routes/auth';
import createQueueRouter from './routes/queue';
import createOvernightQueueRouter from './routes/overnightQueue';
import createQueueBookingRouter from './routes/queueBooking';
import createCashBookingRouter from './routes/cashBooking';
import bookingRoutes from './routes/booking';
import localBookingRoutes from './routes/localBooking';
import vehicleRoutes from './routes/vehicle';
import stationRoutes from './routes/station';
import { createDashboardRouter } from './routes/dashboard';
import staffRoutes from './routes/staff';
import routeRoutes from './routes/route';
// Driver tickets routes removed - simplified to vehicle-only system
import dayPassRoutes from './routes/dayPass';
import publicRoutes from './routes/public';
import analyticsRoutes from './routes/analytics';
// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestLogger } from './middleware/requestLogger';

// Import services
import { cronService } from './services/cronService';
import { getRedisService } from './services/redisService';
import { getMQTTService } from './services/mqttService';

import * as dashboardController from './controllers/dashboardController';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
if (env.ENABLE_CORS) {
  app.use(cors({
    credentials: true,
    origin: true, // Allow all origins for Tauri app compatibility
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
if (env.ENABLE_REQUEST_LOGGING) {
  app.use(morgan('combined'));
}

// Custom request logger
app.use(requestLogger);

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await import('./config/database').then(db => db.healthCheck());
  const redisHealth = await getRedisService().healthCheck();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    database: dbHealth,
    redis: redisHealth,
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    connectionInfo: await getConnectionInfo(),
  });
});

const startServer = async () => {
  try {
    // Test database connection
    const isDbConnected = await testConnection();
    if (!isDbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }

    console.log('✅ Database connection successful');

    // Initialize Redis connection
    const redisService = getRedisService();
    const isRedisConnected = await redisService.connect();
    if (!isRedisConnected) {
      console.warn('⚠️ Failed to connect to Redis - continuing without caching');
    } else {
      console.log('✅ Redis connection successful');
    }

    // Initialize MQTT service
    const mqttService = getMQTTService();
    const isMQTTConnected = await mqttService.connect();
    if (!isMQTTConnected) {
      console.warn('⚠️ Failed to connect to MQTT broker - continuing without real-time updates');
    } else {
      console.log('✅ MQTT broker connection successful');
    }

    // Initialize cron service for scheduled tasks
    cronService.initialize();

    // API routes
    app.use('/api/auth', authRoutes);
    app.use('/api/bookings', localBookingRoutes);
    app.use('/api/vehicles', vehicleRoutes);
    app.use('/api/station', stationRoutes);
    app.use('/api/staff', staffRoutes);
    app.use('/api/routes', routeRoutes);
    // Driver tickets routes removed - simplified to vehicle-only system
    app.use('/api/day-pass', dayPassRoutes);
    app.use('/api/public', publicRoutes);
    
    // Initialize queue routes
    const queueRoutes = createQueueRouter();
    app.use('/api/queue', queueRoutes);

    // Initialize overnight queue routes
    const overnightQueueRoutes = createOvernightQueueRouter();
    app.use('/api/overnight-queue', overnightQueueRoutes);

    // Initialize queue booking routes
    const queueBookingRoutes = createQueueBookingRouter();
    app.use('/api/queue-booking', queueBookingRoutes);

    // Initialize simplified cash booking routes
    const cashBookingRoutes = createCashBookingRouter();
    app.use('/api/cash-booking', cashBookingRoutes);

    // Initialize dashboard routes
    const dashboardRoutes = createDashboardRouter();
    app.use('/api/dashboard', dashboardRoutes);

    // Analytics routes
    app.use('/api/analytics', analyticsRoutes);

    // 404 handler - add after all routes
    app.use(notFound);

    // Error handling middleware - must be last
    app.use(errorHandler);

    // Start HTTP server - listen on all interfaces for public access
    const server = app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`
🚀 Louaj Local Node Server Started (Standalone)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server: http://localhost:${env.PORT}
🌐 Public: http://0.0.0.0:${env.PORT}
🏥 Health: http://localhost:${env.PORT}/health
🗄️  Database: ${env.DATABASE_URL}
⚙️  Environment: ${env.NODE_ENV}
📍 Station: ${configService.getStationName()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      server.close(async () => {
        console.log('📡 HTTP server closed');
        
        // Close Redis connection
        await redisService.disconnect();
        console.log('🔴 Redis connection closed');
        
        // Close MQTT connection
        await mqttService.disconnect();
        console.log('📡 MQTT broker connection closed');
        
        // Close database connection
        await import('./config/database').then(db => db.prisma.$disconnect());
        console.log('🗄️  Database connection closed');
        
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();