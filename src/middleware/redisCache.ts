import { Request, Response, NextFunction } from 'express';
import { getRedisService } from '../services/redisService';
import { REDIS_KEYS, CACHE_TTL } from '../config/redisConfig';

interface CacheOptions {
  key: string;
  ttl?: number;
  skipCache?: boolean;
}

/**
 * Redis caching middleware
 * Caches GET requests based on the provided key
 */
export const cache = (options: CacheOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache if explicitly requested
    if (options.skipCache || req.query.skipCache === 'true') {
      return next();
    }

    try {
      const redis = getRedisService();
      
      // Check if Redis is connected
      if (!redis.getConnectionStatus()) {
        console.log('⚠️ Redis not connected, skipping cache');
        return next();
      }

      // Generate cache key
      const cacheKey = `${options.key}:${JSON.stringify(req.query)}`;
      
      // Try to get from cache
      const cachedData = await redis.getJSON(cacheKey);
      
      if (cachedData) {
        console.log(`✅ Cache hit for key: ${cacheKey}`);
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`❌ Cache miss for key: ${cacheKey}`);
      
      // Store original res.json method
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = function(data: any) {
        // Cache the response data
        redis.setJSON(cacheKey, data, options.ttl || CACHE_TTL.ROUTES)
          .then(() => {
            console.log(`✅ Cached response for key: ${cacheKey}`);
          })
          .catch((error) => {
            console.error(`❌ Failed to cache response for key ${cacheKey}:`, error);
          });

        // Call original json method
        return originalJson.call(this, {
          ...data,
          cached: false,
          timestamp: new Date().toISOString()
        });
      };

      next();
    } catch (error) {
      console.error('❌ Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Cache invalidation middleware
 * Invalidates cache when data is modified
 */
export const invalidateCache = (patterns: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original res.json method
    const originalJson = res.json;
    
    // Override res.json to invalidate cache after successful response
    res.json = function(data: any) {
      // Only invalidate cache for successful responses
      if (data.success !== false) {
        const redis = getRedisService();
        
        if (redis.getConnectionStatus()) {
          // Invalidate cache patterns
          patterns.forEach(async (pattern) => {
            try {
              const keys = await redis.keys(pattern);
              if (keys.length > 0) {
                // Use the del method from RedisService instead of accessing private client
                for (const key of keys) {
                  await redis.del(key);
                }
                console.log(`🗑️ Invalidated ${keys.length} cache keys for pattern: ${pattern}`);
              }
            } catch (error) {
              console.error(`❌ Failed to invalidate cache pattern ${pattern}:`, error);
            }
          });
        }
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Specific cache middleware for routes
 */
export const cacheRoutes = () => cache({
  key: REDIS_KEYS.ROUTES + 'all',
  ttl: CACHE_TTL.ROUTES
});

/**
 * Specific cache middleware for vehicles
 */
export const cacheVehicles = () => cache({
  key: REDIS_KEYS.VEHICLES + 'all',
  ttl: CACHE_TTL.VEHICLES
});

/**
 * Specific cache middleware for queue data
 */
export const cacheQueue = (destinationId: string) => cache({
  key: `${REDIS_KEYS.QUEUE}${destinationId}`,
  ttl: CACHE_TTL.QUEUE
});

/**
 * Cache invalidation for routes
 */
export const invalidateRoutesCache = () => invalidateCache([
  `${REDIS_KEYS.ROUTES}*`
]);

/**
 * Cache invalidation for vehicles
 */
export const invalidateVehiclesCache = () => invalidateCache([
  `${REDIS_KEYS.VEHICLES}*`
]);

/**
 * Cache invalidation for queue data
 */
export const invalidateQueueCache = () => invalidateCache([
  `${REDIS_KEYS.QUEUE}*`,
  `${REDIS_KEYS.LIVE_QUEUE}*`
]);

/**
 * Cache invalidation for bookings
 */
export const invalidateBookingsCache = () => invalidateCache([
  `${REDIS_KEYS.BOOKINGS}*`,
  `${REDIS_KEYS.LIVE_BOOKINGS}*`
]);

/**
 * Cache invalidation for all data
 */
export const invalidateAllCache = () => invalidateCache([
  `${REDIS_KEYS.ROUTES}*`,
  `${REDIS_KEYS.VEHICLES}*`,
  `${REDIS_KEYS.QUEUE}*`,
  `${REDIS_KEYS.BOOKINGS}*`,
  `${REDIS_KEYS.LIVE_QUEUE}*`,
  `${REDIS_KEYS.LIVE_BOOKINGS}*`
]);