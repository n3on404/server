import { prisma } from '../config/database';
import { getRedisService } from './redisService';
import { REDIS_KEYS, CACHE_TTL } from '../config/redisConfig';

export class RouteService {
  private static stationNameCache: Map<string, string> = new Map();
  private static cacheExpiry: Map<string, number> = new Map();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get station name by station ID from route table
   * Uses caching to improve performance
   */
  async getStationNameById(stationId: string): Promise<string> {
    try {
      // Check cache first
      const cached = RouteService.stationNameCache.get(stationId);
      const cacheTime = RouteService.cacheExpiry.get(stationId);
      
      if (cached && cacheTime && Date.now() < cacheTime) {
        return cached;
      }

      // Fetch from database
      const route = await prisma.route.findUnique({
        where: { stationId },
        select: { stationName: true }
      });

      if (route?.stationName) {
        // Cache the result
        RouteService.stationNameCache.set(stationId, route.stationName);
        RouteService.cacheExpiry.set(stationId, Date.now() + RouteService.CACHE_DURATION);
        return route.stationName;
      }

      // Fallback to formatted station ID if not found in routes
      const fallbackName = this.formatStationId(stationId);
      console.warn(`⚠️ Station name not found in routes for ${stationId}, using fallback: ${fallbackName}`);
      return fallbackName;

    } catch (error) {
      console.error(`❌ Error fetching station name for ${stationId}:`, error);
      return this.formatStationId(stationId);
    }
  }

  /**
   * Clear station name cache (useful when routes are updated)
   */
  static clearStationNameCache(): void {
    RouteService.stationNameCache.clear();
    RouteService.cacheExpiry.clear();
    console.log('✅ Station name cache cleared');
  }

  /**
   * Format station ID as fallback when route not found
   */
  private formatStationId(stationId: string): string {
    // Convert station-tunis to "Tunis", station-sfax to "Sfax", etc.
    return stationId
      .replace(/^station-/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get all routes with Redis caching
   */
  async getAllRoutes() {
    try {
      const redis = getRedisService();
      
      // Try to get from Redis cache first
      if (redis.getConnectionStatus()) {
        const cachedRoutes = await redis.getCachedRoutes();
        if (cachedRoutes) {
          console.log('✅ Routes retrieved from Redis cache');
          return cachedRoutes;
        }
      }

      // Fetch from database
      const routes = await prisma.route.findMany({
        orderBy: {
          stationName: 'asc'
        }
      });

      // Cache in Redis
      if (redis.getConnectionStatus()) {
        await redis.cacheRoutes(routes);
        console.log('✅ Routes cached in Redis');
      }

      return routes;
    } catch (error) {
      console.error('Error getting all routes:', error);
      throw error;
    }
  }

  /**
   * Get route by ID
   */
  async getRouteById(id: string) {
    try {
      const route = await prisma.route.findUnique({
        where: { id }
      });

      return route;
    } catch (error) {
      console.error('Error getting route by ID:', error);
      throw error;
    }
  }

  /**
   * Update route price
   */
  async updateRoutePrice(id: string, basePrice: number, supervisorStationId: string) {
    try {
      // First update the local database
      const updatedRoute = await prisma.route.update({
        where: { id },
        data: {
          basePrice,
          updatedAt: new Date()
        }
      });


      return updatedRoute;
    } catch (error) {
      console.error('Error updating route price:', error);
      throw error;
    }
  }

  

  /**
   * Get routes by station ID
   */
  async getRoutesByStation(stationId: string) {
    try {
      const routes = await prisma.route.findMany({
        where: { stationId },
        orderBy: {
          stationName: 'asc'
        }
      });

      return routes;
    } catch (error) {
      console.error('Error getting routes by station:', error);
      throw error;
    }
  }

  /**
   * Get route by station ID (single route)
   */
  async getRouteByStationId(stationId: string) {
    try {
      const route = await prisma.route.findUnique({
        where: { stationId }
      });

      return route;
    } catch (error) {
      console.error('Error getting route by station ID:', error);
      throw error;
    }
  }

  /**
   * Create a new route
   */
  async createRoute(routeData: {
    stationId: string;
    stationName: string;
    basePrice: number;
    governorate?: string;
    governorateAr?: string;
    delegation?: string;
    delegationAr?: string;
  }) {
    try {
      // Check if route already exists
      const existingRoute = await prisma.route.findUnique({
        where: { stationId: routeData.stationId }
      });

      if (existingRoute) {
        throw new Error('Route already exists for this station');
      }

      // Generate unique ID
      const id = `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newRoute = await prisma.route.create({
        data: {
          id,
          stationId: routeData.stationId,
          stationName: routeData.stationName,
          basePrice: routeData.basePrice,
          governorate: routeData.governorate || null,
          governorateAr: routeData.governorateAr || null,
          delegation: routeData.delegation || null,
          delegationAr: routeData.delegationAr || null,
          isActive: true
        }
      });

      console.log(`✅ Route created: ${newRoute.stationName} (${newRoute.stationId}) - ${newRoute.basePrice} TND`);
      return newRoute;
    } catch (error) {
      console.error('Error creating route:', error);
      throw error;
    }
  }

  /**
   * Delete a route
   */
  async deleteRoute(id: string) {
    try {
      // Check if route exists
      const existingRoute = await prisma.route.findUnique({
        where: { id }
      });

      if (!existingRoute) {
        throw new Error('Route not found');
      }

      // Delete the route
      const deletedRoute = await prisma.route.delete({
        where: { id }
      });

      console.log(`✅ Route deleted: ${deletedRoute.stationName} (${deletedRoute.stationId})`);
      return deletedRoute;
    } catch (error) {
      console.error('Error deleting route:', error);
      throw error;
    }
  }
}

export const routeService = new RouteService(); 