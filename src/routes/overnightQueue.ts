import { Router } from 'express';
import { createOvernightQueueController } from '../controllers/overnightQueueController';
import { authenticate, requireSupervisor } from '../middleware/auth';

// Create a function that returns the router with the controller
export default function createOvernightQueueRouter() {
  const router = Router();
  
  // Create controller without WebSocket service
  const overnightQueueController = createOvernightQueueController();

  // Apply authentication and supervisor authorization to all routes
  router.use(authenticate);
  router.use(requireSupervisor);

  /**
   * @route POST /api/overnight-queue/add
   * @desc Add a vehicle to the overnight queue
   * @access Private (Supervisor only)
   * @body { licensePlate: string }
   */
  router.post('/add', overnightQueueController.addToOvernightQueue.bind(overnightQueueController));

  /**
   * @route POST /api/overnight-queue/remove
   * @desc Remove a vehicle from the overnight queue
   * @access Private (Supervisor only)
   * @body { licensePlate: string }
   */
  router.post('/remove', overnightQueueController.removeFromOvernightQueue.bind(overnightQueueController));

  /**
   * @route GET /api/overnight-queue/all
   * @desc Get all overnight queues grouped by destination
   * @access Private (Supervisor only)
   */
  router.get('/all', overnightQueueController.getAllOvernightQueues.bind(overnightQueueController));

  /**
   * @route GET /api/overnight-queue/stats
   * @desc Get overnight queue statistics
   * @access Private (Supervisor only)
   */
  router.get('/stats', overnightQueueController.getOvernightQueueStats.bind(overnightQueueController));

  /**
   * @route POST /api/overnight-queue/transfer
   * @desc Manually trigger transfer of overnight queue vehicles to regular queue
   * @access Private (Supervisor only)
   */
  router.post('/transfer', overnightQueueController.transferOvernightToRegular.bind(overnightQueueController));

  /**
   * @route GET /api/overnight-queue/:destinationId
   * @desc Get overnight queue for a specific destination
   * @access Private (Supervisor only)
   * @param {string} destinationId - The destination station ID
   */
  router.get('/:destinationId', overnightQueueController.getOvernightQueueByDestination.bind(overnightQueueController));

  return router;
} 