import { env } from './environment';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string | undefined;
  db: number;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
  connectTimeout: number;
  commandTimeout: number;
}

export const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000
};

export const validateRedisConfig = (): boolean => {
  try {
    if (!redisConfig.host) {
      console.error('❌ REDIS_HOST environment variable is required');
      return false;
    }

    if (redisConfig.port < 1 || redisConfig.port > 65535) {
      console.error('❌ REDIS_PORT must be a valid port number (1-65535)');
      return false;
    }

    if (redisConfig.db < 0 || redisConfig.db > 15) {
      console.error('❌ REDIS_DB must be between 0 and 15');
      return false;
    }

    console.log('✅ Redis configuration validated successfully');
    return true;
  } catch (error) {
    console.error('❌ Redis configuration validation failed:', error);
    return false;
  }
};

// Redis key prefixes for organization
export const REDIS_KEYS = {
  // Authentication & Sessions
  SESSION: 'session:',
  STAFF_TOKEN: 'staff_token:',
  REFRESH_TOKEN: 'refresh_token:',
  
  // Caching
  ROUTES: 'routes:',
  VEHICLES: 'vehicles:',
  QUEUE: 'queue:',
  BOOKINGS: 'bookings:',
  
  // Real-time data
  LIVE_QUEUE: 'live_queue:',
  LIVE_BOOKINGS: 'live_bookings:',
  
  // Statistics
  STATS: 'stats:',
  DAILY_STATS: 'daily_stats:',
  
  // Locks (for concurrency control)
  LOCK: 'lock:',
  QUEUE_LOCK: 'queue_lock:',
  BOOKING_LOCK: 'booking_lock:'
} as const;

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  ROUTES: 3600, // 1 hour
  VEHICLES: 1800, // 30 minutes
  QUEUE: 60, // 1 minute
  BOOKINGS: 300, // 5 minutes
  SESSION: 86400, // 24 hours
  STAFF_TOKEN: 3600, // 1 hour
  STATS: 300, // 5 minutes
  LIVE_DATA: 30 // 30 seconds
} as const;