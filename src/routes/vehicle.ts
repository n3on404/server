import { Router, Request, Response } from 'express';
import { authenticate, requireSupervisor } from '../middleware/auth';
import prisma from '../config/database';
import { getRedisService } from '../services/redisService';
import { cacheVehicles, invalidateVehiclesCache } from '../middleware/redisCache';

const router = Router();

// ================== VEHICLE MANAGEMENT ENDPOINTS ==================

/**
 * GET /api/vehicles
 * Get all vehicles (with Redis caching)
 */
router.get('/', cacheVehicles(), async (req: Request, res: Response): Promise<void> => {
  try {
    const redis = getRedisService();
    
    // Try to get from Redis cache first
    if (redis.getConnectionStatus()) {
      const cachedVehicles = await redis.getCachedVehicles();
      if (cachedVehicles) {
        console.log('✅ Vehicles retrieved from Redis cache');
        res.json({
          success: true,
          message: 'Vehicles retrieved successfully',
          data: cachedVehicles,
          cached: true
        });
        return;
      }
    }

    // Fetch from database
    const vehicles = await prisma.vehicle.findMany({
      include: {
        authorizedStations: true,
        queueEntries: {
          where: { status: 'WAITING' },
          orderBy: { queuePosition: 'asc' }
        }
      },
      orderBy: { licensePlate: 'asc' }
    });

    // Cache in Redis
    if (redis.getConnectionStatus()) {
      await redis.cacheVehicles(vehicles);
      console.log('✅ Vehicles cached in Redis');
    }

    res.json({
      success: true,
      message: 'Vehicles retrieved successfully',
      data: vehicles,
      cached: false
    });
  } catch (error) {
    console.error('❌ Get vehicles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve vehicles',
      code: 'GET_VEHICLES_ERROR'
    });
  }
});

/**
 * GET /api/vehicles/:id
 * Get vehicle by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        authorizedStations: true,
        queueEntries: {
          orderBy: { enteredAt: 'desc' }
        },
        trips: {
          orderBy: { startTime: 'desc' },
          take: 10
        }
      }
    });
    
    if (!vehicle) {
      res.status(404).json({
        success: false,
        message: 'Vehicle not found',
        code: 'VEHICLE_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      message: 'Vehicle retrieved successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('❌ Get vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve vehicle',
      code: 'GET_VEHICLE_ERROR'
    });
  }
});

/**
 * POST /api/vehicles
 * Create a new vehicle (SUPERVISOR only)
 */
router.post('/', authenticate, requireSupervisor, invalidateVehiclesCache(), async (req: Request, res: Response): Promise<void> => {
  try {
    const { licensePlate, capacity = 8, defaultDestinationId, defaultDestinationName } = req.body;
    
    // Validate required fields
    if (!licensePlate) {
      res.status(400).json({
        success: false,
        message: 'License plate is required',
        code: 'MISSING_LICENSE_PLATE'
      });
    }
    
    // Check if vehicle already exists
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { licensePlate }
    });
    
    if (existingVehicle) {
      res.status(409).json({
        success: false,
        message: 'Vehicle with this license plate already exists',
        code: 'VEHICLE_ALREADY_EXISTS'
      });
    }
    
    // Create vehicle
    const vehicle = await prisma.vehicle.create({
      data: {
        id: `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        licensePlate,
        capacity: parseInt(capacity),
        defaultDestinationId,
        defaultDestinationName,
        isActive: true,
        isAvailable: true,
        isBanned: false
      },
      include: {
        authorizedStations: true
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('❌ Create vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vehicle',
      code: 'CREATE_VEHICLE_ERROR'
    });
  }
});

/**
 * PUT /api/vehicles/:id
 * Update vehicle (SUPERVISOR only)
 */
router.put('/:id', authenticate, requireSupervisor, invalidateVehiclesCache(), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { capacity, defaultDestinationId, defaultDestinationName, isActive, isAvailable, isBanned } = req.body;
    
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(capacity && { capacity: parseInt(capacity) }),
        ...(defaultDestinationId && { defaultDestinationId }),
        ...(defaultDestinationName && { defaultDestinationName }),
        ...(isActive !== undefined && { isActive }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isBanned !== undefined && { isBanned })
      },
      include: {
        authorizedStations: true
      }
    });

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('❌ Update vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vehicle',
      code: 'UPDATE_VEHICLE_ERROR'
    });
  }
});

/**
 * DELETE /api/vehicles/:id
 * Delete vehicle (SUPERVISOR only)
 */
router.delete('/:id', authenticate, requireSupervisor, invalidateVehiclesCache(), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Check if vehicle exists
    const vehicle = await prisma.vehicle.findUnique({
      where: { id }
    });
    
    if (!vehicle) {
      res.status(404).json({
        success: false,
        message: 'Vehicle not found',
        code: 'VEHICLE_NOT_FOUND'
      });
    }
    
    // Delete vehicle
    await prisma.vehicle.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vehicle',
      code: 'DELETE_VEHICLE_ERROR'
    });
  }
});

/**
 * GET /api/vehicles/search
 * Search vehicles by license plate
 */
router.get('/search/:query', async (req: Request, res: Response) => {
  try {
    const { query } = req.params;
    
    const vehicles = await prisma.vehicle.findMany({
      where: {
        licensePlate: {
          contains: query,
          mode: 'insensitive'
        }
      },
      include: {
        authorizedStations: true
      },
      orderBy: { licensePlate: 'asc' }
    });
    
    res.json({
      success: true,
      message: 'Vehicle search completed',
      data: vehicles
    });
  } catch (error) {
    console.error('❌ Search vehicles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search vehicles',
      code: 'SEARCH_VEHICLES_ERROR'
    });
  }
});

/**
 * POST /api/vehicles/:id/authorize-station
 * Authorize vehicle for a station (SUPERVISOR only)
 */
router.post('/:id/authorize-station', authenticate, requireSupervisor, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { stationId, stationName, priority = 1, isDefault = false } = req.body;
    
    // Check if vehicle exists
    const vehicle = await prisma.vehicle.findUnique({
      where: { id }
    });
    
    if (!vehicle) {
      res.status(404).json({
        success: false,
        message: 'Vehicle not found',
        code: 'VEHICLE_NOT_FOUND'
      });
    }
    
    // Create authorization
    const authorization = await prisma.vehicleAuthorizedStation.create({
      data: {
        vehicleId: id,
        stationId,
        stationName,
        priority,
        isDefault
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Station authorization created successfully',
      data: authorization
    });
  } catch (error) {
    console.error('❌ Authorize station error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to authorize station',
      code: 'AUTHORIZE_STATION_ERROR'
    });
  }
});

/**
 * DELETE /api/vehicles/:id/authorize-station/:stationId
 * Remove station authorization (SUPERVISOR only)
 */
router.delete('/:id/authorize-station/:stationId', authenticate, requireSupervisor, async (req: Request, res: Response) => {
  try {
    const { id, stationId } = req.params;
    
    await prisma.vehicleAuthorizedStation.deleteMany({
      where: {
        vehicleId: id,
        stationId
      }
    });

    res.json({
      success: true,
      message: 'Station authorization removed successfully'
    });
  } catch (error) {
    console.error('❌ Remove authorization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove station authorization',
      code: 'REMOVE_AUTHORIZATION_ERROR'
    });
  }
});

export default router;