import Redis from 'ioredis';
import { redisConfig, REDIS_KEYS, CACHE_TTL } from '../config/redisConfig';

export class RedisService {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    // Create Redis options with proper typing, handling undefined password
    const redisOptions: any = {
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db,
      retryDelayOnFailover: redisConfig.retryDelayOnFailover,
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
      lazyConnect: redisConfig.lazyConnect,
      connectTimeout: redisConfig.connectTimeout,
      commandTimeout: redisConfig.commandTimeout
    };
    
    // Only add password if it's defined
    if (redisConfig.password) {
      redisOptions.password = redisConfig.password;
    }
    
    this.client = new Redis(redisOptions);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('✅ Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('🚀 Redis ready to accept commands');
    });

    this.client.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('🔌 Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });
  }

  // Connection management
  async connect(): Promise<boolean> {
    try {
      await this.client.connect();
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      console.log('✅ Redis disconnected gracefully');
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Basic Redis operations
  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.error(`❌ Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`❌ Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error(`❌ Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  // JSON operations
  async setJSON(key: string, data: any, ttl?: number): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(data);
      return await this.set(key, jsonString, ttl);
    } catch (error) {
      console.error(`❌ Redis SET JSON error for key ${key}:`, error);
      return false;
    }
  }

  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const jsonString = await this.get(key);
      if (!jsonString) return null;
      return JSON.parse(jsonString) as T;
    } catch (error) {
      console.error(`❌ Redis GET JSON error for key ${key}:`, error);
      return null;
    }
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.client.hset(key, field, value);
      return true;
    } catch (error) {
      console.error(`❌ Redis HSET error for key ${key}:`, error);
      return false;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      console.error(`❌ Redis HGET error for key ${key}:`, error);
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      console.error(`❌ Redis HGETALL error for key ${key}:`, error);
      return null;
    }
  }

  async hdel(key: string, field: string): Promise<boolean> {
    try {
      const result = await this.client.hdel(key, field);
      return result > 0;
    } catch (error) {
      console.error(`❌ Redis HDEL error for key ${key}:`, error);
      return false;
    }
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lpush(key, ...values);
    } catch (error) {
      console.error(`❌ Redis LPUSH error for key ${key}:`, error);
      return 0;
    }
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.rpush(key, ...values);
    } catch (error) {
      console.error(`❌ Redis RPUSH error for key ${key}:`, error);
      return 0;
    }
  }

  async lpop(key: string): Promise<string | null> {
    try {
      return await this.client.lpop(key);
    } catch (error) {
      console.error(`❌ Redis LPOP error for key ${key}:`, error);
      return null;
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      console.error(`❌ Redis RPOP error for key ${key}:`, error);
      return null;
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      console.error(`❌ Redis LRANGE error for key ${key}:`, error);
      return [];
    }
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      console.error(`❌ Redis SADD error for key ${key}:`, error);
      return 0;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.srem(key, ...members);
    } catch (error) {
      console.error(`❌ Redis SREM error for key ${key}:`, error);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      console.error(`❌ Redis SMEMBERS error for key ${key}:`, error);
      return [];
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis SISMEMBER error for key ${key}:`, error);
      return false;
    }
  }

  // Counter operations
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error(`❌ Redis INCR error for key ${key}:`, error);
      return 0;
    }
  }

  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      console.error(`❌ Redis DECR error for key ${key}:`, error);
      return 0;
    }
  }

  async incrby(key: string, increment: number): Promise<number> {
    try {
      return await this.client.incrby(key, increment);
    } catch (error) {
      console.error(`❌ Redis INCRBY error for key ${key}:`, error);
      return 0;
    }
  }

  // Pattern matching
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`❌ Redis KEYS error for pattern ${pattern}:`, error);
      return [];
    }
  }


  // Session management
  async setSession(sessionId: string, sessionData: any): Promise<boolean> {
    return await this.setJSON(REDIS_KEYS.SESSION + sessionId, sessionData, CACHE_TTL.SESSION);
  }

  async getSession(sessionId: string): Promise<any | null> {
    return await this.getJSON(REDIS_KEYS.SESSION + sessionId);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return await this.del(REDIS_KEYS.SESSION + sessionId);
  }

  // Staff token management
  async setStaffToken(token: string, staffData: any): Promise<boolean> {
    return await this.setJSON(REDIS_KEYS.STAFF_TOKEN + token, staffData, CACHE_TTL.STAFF_TOKEN);
  }

  async getStaffToken(token: string): Promise<any | null> {
    return await this.getJSON(REDIS_KEYS.STAFF_TOKEN + token);
  }

  async deleteStaffToken(token: string): Promise<boolean> {
    return await this.del(REDIS_KEYS.STAFF_TOKEN + token);
  }

  // Statistics
  async incrementDailyStats(metric: string, value: number = 1): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${REDIS_KEYS.DAILY_STATS}${today}:${metric}`;
    return await this.incrby(key, value);
  }

  async getDailyStats(metric: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${REDIS_KEYS.DAILY_STATS}${today}:${metric}`;
    const result = await this.get(key);
    return result ? parseInt(result) : 0;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; connected: boolean; latency?: number }> {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'ok',
        connected: this.isConnected,
        latency
      };
    } catch (error) {
      return {
        status: 'error',
        connected: false
      };
    }
  }

  // Pub/Sub methods
  async publish(channel: string, message: any): Promise<number> {
    try {
      const messageStr = JSON.stringify(message);
      const result = await this.client.publish(channel, messageStr);
      console.log(`📢 Published message to channel ${channel}`);
      return result;
    } catch (error) {
      console.error(`❌ Redis PUBLISH error for channel ${channel}:`, error);
      return 0;
    }
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    try {
      await this.client.subscribe(channel);
      this.client.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (error) {
            console.error(`❌ Error parsing message from channel ${channel}:`, error);
          }
        }
      });
      console.log(`📡 Subscribed to channel ${channel}`);
    } catch (error) {
      console.error(`❌ Redis SUBSCRIBE error for channel ${channel}:`, error);
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.client.unsubscribe(channel);
      console.log(`📡 Unsubscribed from channel ${channel}`);
    } catch (error) {
      console.error(`❌ Redis UNSUBSCRIBE error for channel ${channel}:`, error);
    }
  }

  // Vehicle caching methods
  async cacheVehicles(vehicles: any[]): Promise<void> {
    try {
      const key = `${REDIS_KEYS.VEHICLES}:all`;
      await this.setJSON(key, vehicles, CACHE_TTL.VEHICLES);
      console.log(`✅ Cached ${vehicles.length} vehicles`);
    } catch (error) {
      console.error('❌ Error caching vehicles:', error);
    }
  }

  async getCachedVehicles(): Promise<any[] | null> {
    try {
      const key = `${REDIS_KEYS.VEHICLES}:all`;
      return await this.getJSON(key);
    } catch (error) {
      console.error('❌ Error getting cached vehicles:', error);
      return null;
    }
  }

  async cacheVehicle(vehicleId: string, vehicle: any): Promise<void> {
    try {
      const key = `${REDIS_KEYS.VEHICLES}:${vehicleId}`;
      await this.setJSON(key, vehicle, CACHE_TTL.VEHICLES);
    } catch (error) {
      console.error('❌ Error caching vehicle:', error);
    }
  }

  async getCachedVehicle(vehicleId: string): Promise<any | null> {
    try {
      const key = `${REDIS_KEYS.VEHICLES}:${vehicleId}`;
      return await this.getJSON(key);
    } catch (error) {
      console.error('❌ Error getting cached vehicle:', error);
      return null;
    }
  }

  // Route caching methods
  async cacheRoutes(routes: any[]): Promise<void> {
    try {
      const key = `${REDIS_KEYS.ROUTES}:all`;
      await this.setJSON(key, routes, CACHE_TTL.ROUTES);
      console.log(`✅ Cached ${routes.length} routes`);
    } catch (error) {
      console.error('❌ Error caching routes:', error);
    }
  }

  async getCachedRoutes(): Promise<any[] | null> {
    try {
      const key = `${REDIS_KEYS.ROUTES}:all`;
      return await this.getJSON(key);
    } catch (error) {
      console.error('❌ Error getting cached routes:', error);
      return null;
    }
  }

  async cacheRoute(routeId: string, route: any): Promise<void> {
    try {
      const key = `${REDIS_KEYS.ROUTES}:${routeId}`;
      await this.setJSON(key, route, CACHE_TTL.ROUTES);
    } catch (error) {
      console.error('❌ Error caching route:', error);
    }
  }

  async getCachedRoute(routeId: string): Promise<any | null> {
    try {
      const key = `${REDIS_KEYS.ROUTES}:${routeId}`;
      return await this.getJSON(key);
    } catch (error) {
      console.error('❌ Error getting cached route:', error);
      return null;
    }
  }

  // Queue caching methods
  async cacheQueueEntries(destinationId: string, entries: any[]): Promise<void> {
    try {
      const key = `${REDIS_KEYS.QUEUE}:${destinationId}`;
      await this.setJSON(key, entries, CACHE_TTL.QUEUE);
    } catch (error) {
      console.error('❌ Error caching queue entries:', error);
    }
  }

  async getCachedQueueEntries(destinationId: string): Promise<any[] | null> {
    try {
      const key = `${REDIS_KEYS.QUEUE}:${destinationId}`;
      return await this.getJSON(key);
    } catch (error) {
      console.error('❌ Error getting cached queue entries:', error);
      return null;
    }
  }

  // Cleanup methods
  async clearCache(): Promise<boolean> {
    try {
      const keys = await this.keys(`${REDIS_KEYS.ROUTES}*`);
      const vehicleKeys = await this.keys(`${REDIS_KEYS.VEHICLES}*`);
      const queueKeys = await this.keys(`${REDIS_KEYS.QUEUE}*`);
      const bookingKeys = await this.keys(`${REDIS_KEYS.BOOKINGS}*`);
      
      const allKeys = [...keys, ...vehicleKeys, ...queueKeys, ...bookingKeys];
      
      if (allKeys.length > 0) {
        await this.client.del(...allKeys);
      }
      
      console.log(`✅ Cleared ${allKeys.length} cache keys`);
      return true;
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      return false;
    }
  }
}

// Singleton instance
let redisService: RedisService | null = null;

export const getRedisService = (): RedisService => {
  if (!redisService) {
    redisService = new RedisService();
  }
  return redisService;
};

export default getRedisService;