import { Router } from 'express';
import { routeController } from '../controllers/routeController';
import { authenticate, requireSupervisor, requireAdmin } from '../middleware/auth';
import { cacheRoutes, invalidateRoutesCache } from '../middleware/redisCache';

const router = Router();

/**
 * GET /api/routes
 * Get all routes (with Redis caching)
 */
router.get('/', cacheRoutes(), routeController.getAllRoutes.bind(routeController));

/**
 * POST /api/routes
 * Create a new route (ADMIN only)
 */
router.post('/', authenticate, requireAdmin, invalidateRoutesCache(), routeController.createRoute.bind(routeController));

/**
 * GET /api/routes/:id
 * Get route by ID
 */
router.get('/:id', routeController.getRouteById.bind(routeController));

/**
 * PUT /api/routes/:id
 * Update route price (SUPERVISOR only)
 */
router.put('/:id', authenticate, requireSupervisor, invalidateRoutesCache(), routeController.updateRoutePrice.bind(routeController));

/**
 * DELETE /api/routes/:id
 * Delete a route (ADMIN only)
 */
router.delete('/:id', authenticate, requireAdmin, invalidateRoutesCache(), routeController.deleteRoute.bind(routeController));

/**
 * GET /api/routes/station/:stationId
 * Get routes by station ID
 */
router.get('/station/:stationId', routeController.getRoutesByStation.bind(routeController));

export default router; 