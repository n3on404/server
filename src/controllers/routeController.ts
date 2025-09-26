import { Request, Response } from 'express';
import { routeService } from '../services/routeService';
import { prisma } from '../config/database';
import { configService } from '../config/supervisorConfig';

export class RouteController {
  /**
   * GET /api/routes
   * Get all routes
   */
  async getAllRoutes(req: Request, res: Response): Promise<void> {
    try {
      const routes = await routeService.getAllRoutes();
      
      res.json({
        success: true,
        message: 'Routes retrieved successfully',
        data: routes
      });
    } catch (error: any) {
      console.error('❌ Get all routes error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve routes',
        code: 'GET_ROUTES_ERROR'
      });
    }
  }

  /**
   * GET /api/routes/:id
   * Get route by ID
   */
  async getRouteById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const route = await routeService.getRouteById(id);
      
      if (!route) {
        res.status(404).json({
          success: false,
          message: 'Route not found',
          code: 'ROUTE_NOT_FOUND'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Route retrieved successfully',
        data: route
      });
    } catch (error: any) {
      console.error('❌ Get route by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve route',
        code: 'GET_ROUTE_ERROR'
      });
    }
  }

  /**
   * PUT /api/routes/:id
   * Update route price (SUPERVISOR only)
   */
  async updateRoutePrice(req: Request, res: Response): Promise<void> {
    try {
      // Check if user is authenticated and is a supervisor
      if (!req.staff) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const { role, station } = req.staff;
      console.log(req.staff);
      if (role !== 'SUPERVISOR') {
        res.status(403).json({
          success: false,
          message: 'Only supervisors can update route prices',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        return;
      }

      // Resolve supervisor station ID
      let supervisorStationId: string | undefined = station?.id;
      if (!supervisorStationId) {
        const fallbackStationId = configService.getStationId();
        if (fallbackStationId && fallbackStationId !== 'unknown-station') {
          supervisorStationId = fallbackStationId;
          console.log(`ℹ️ Using fallback station from config for supervisor: ${supervisorStationId}`);
        } else {
          res.status(400).json({
            success: false,
            message: 'Supervisor must be assigned to a station',
            code: 'NO_STATION_ASSIGNED'
          });
          return;
        }
      }

      const { id } = req.params;
      const { basePrice } = req.body;

      if (!basePrice || typeof basePrice !== 'number' || basePrice <= 0) {
        res.status(400).json({
          success: false,
          message: 'basePrice must be a positive number',
          code: 'INVALID_PRICE'
        });
        return;
      }

      // Get the route to verify it belongs to supervisor's station
      const route = await prisma.route.findUnique({
        where: { id }
      });

      if (!route) {
        res.status(404).json({
          success: false,
          message: 'Route not found',
          code: 'ROUTE_NOT_FOUND'
        });
        return;
      }



      const updatedRoute = await routeService.updateRoutePrice(id, basePrice, supervisorStationId);
      
      if (!updatedRoute) {
        res.status(404).json({
          success: false,
          message: 'Route not found',
          code: 'ROUTE_NOT_FOUND'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Route price updated successfully and synced to central server',
        data: updatedRoute
      });
    } catch (error: any) {
      console.error('❌ Update route price error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update route price',
        code: 'UPDATE_ROUTE_ERROR'
      });
    }
  }

  /**
   * GET /api/routes/station/:stationId
   * Get routes by station ID
   */
  async getRoutesByStation(req: Request, res: Response): Promise<void> {
    try {
      const { stationId } = req.params;
      const routes = await routeService.getRoutesByStation(stationId);
      
      res.json({
        success: true,
        message: 'Routes retrieved successfully',
        data: routes
      });
    } catch (error: any) {
      console.error('❌ Get routes by station error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve routes for station',
        code: 'GET_STATION_ROUTES_ERROR'
      });
    }
  }

  /**
   * POST /api/routes
   * Create a new route (ADMIN only)
   */
  async createRoute(req: Request, res: Response): Promise<void> {
    try {
      // Check if user is authenticated and is an admin
      if (!req.staff) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const { role } = req.staff;
      if (role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Only admins can create routes',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        return;
      }

      const { stationId, stationName, basePrice, governorate, governorateAr, delegation, delegationAr } = req.body;

      // Validate required fields
      if (!stationId || !stationName || !basePrice) {
        res.status(400).json({
          success: false,
          message: 'stationId, stationName, and basePrice are required',
          code: 'MISSING_REQUIRED_FIELDS'
        });
        return;
      }

      if (typeof basePrice !== 'number' || basePrice <= 0) {
        res.status(400).json({
          success: false,
          message: 'basePrice must be a positive number',
          code: 'INVALID_PRICE'
        });
        return;
      }

      const newRoute = await routeService.createRoute({
        stationId,
        stationName,
        basePrice,
        governorate,
        governorateAr,
        delegation,
        delegationAr
      });

      res.status(201).json({
        success: true,
        message: 'Route created successfully',
        data: newRoute
      });
    } catch (error: any) {
      console.error('❌ Create route error:', error);
      
      if (error.message === 'Route already exists for this station') {
        res.status(409).json({
          success: false,
          message: 'Route already exists for this station',
          code: 'ROUTE_ALREADY_EXISTS'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create route',
        code: 'CREATE_ROUTE_ERROR'
      });
    }
  }

  /**
   * DELETE /api/routes/:id
   * Delete a route (ADMIN only)
   */
  async deleteRoute(req: Request, res: Response): Promise<void> {
    try {
      // Check if user is authenticated and is an admin
      if (!req.staff) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const { role } = req.staff;
      if (role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Only admins can delete routes',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        return;
      }

      const { id } = req.params;

      const deletedRoute = await routeService.deleteRoute(id);

      res.json({
        success: true,
        message: 'Route deleted successfully',
        data: deletedRoute
      });
    } catch (error: any) {
      console.error('❌ Delete route error:', error);
      
      if (error.message === 'Route not found') {
        res.status(404).json({
          success: false,
          message: 'Route not found',
          code: 'ROUTE_NOT_FOUND'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to delete route',
        code: 'DELETE_ROUTE_ERROR'
      });
    }
  }
}

export const routeController = new RouteController(); 