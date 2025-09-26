import { Request, Response } from 'express';
import { createQueueService } from '../services/queueService';

export class QueueController {
  private queueService: ReturnType<typeof createQueueService>;

  constructor() {
    this.queueService = createQueueService();
  }

  /**
   * Enter a vehicle into a queue
   * POST /api/queue/enter
   * 
   * Request body:
   * - licensePlate (required): Vehicle license plate
   * - destinationId (optional): Destination station ID (if not provided, uses vehicle's default destination)
   * - destinationName (optional): Destination station name (auto-fetched if not provided)
   * - availableSeats (optional): Available seats (defaults to vehicle capacity)
   * - totalSeats (optional): Total seats (defaults to vehicle capacity)
   * 
   * Note: All other information (basePrice, vehicle details) is automatically fetched from:
   * - Vehicle record (capacity, authorization status)
   * - Route table (basePrice based on destination)
   * - Station configuration (service fees, etc.)
   */
  async enterQueue(req: Request, res: Response): Promise<void> {
    try {
      const { 
        licensePlate, 
        destinationId, 
        destinationName, 
        availableSeats, 
        totalSeats,
        basePrice, // Optional - will be fetched from route table if not provided
        driverInfo,
        vehicleInfo
      } = req.body;

      // Validate input
      if (!licensePlate) {
        res.status(400).json({
          success: false,
          error: 'License plate is required'
        });
        return;
      }

      // Use the enhanced enterQueue method with additional parameters
      // basePrice will be automatically fetched from route table if not provided
      const result = await this.queueService.enterQueue(
        licensePlate, 
        {
          destinationId,
          destinationName,
          availableSeats,
          totalSeats,
          basePrice, // Optional - system will fetch from route table if not provided
          driverInfo,
          vehicleInfo
        }
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: `Vehicle ${licensePlate} entered queue successfully`,
          data: result.queueEntry
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in enterQueue controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Exit a vehicle from the queue
   * POST /api/queue/exit
   */
  async exitQueue(req: Request, res: Response): Promise<void> {
    try {
      const { licensePlate } = req.body;

      // Validate input
      if (!licensePlate) {
        res.status(400).json({
          success: false,
          error: 'License plate is required'
        });
        return;
      }

      const result = await this.queueService.exitQueue(licensePlate);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: `Vehicle ${licensePlate} exited queue successfully`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in exitQueue controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get all available destination queues
   * GET /api/queue/available
   */
  async getAvailableQueues(req: Request, res: Response): Promise<void> {
    try {
      const { governorate, delegation } = req.query;
      const filters: { governorate?: string; delegation?: string } = {};
      
      if (governorate && typeof governorate === 'string') {
        filters.governorate = governorate;
      }
      if (delegation && typeof delegation === 'string') {
        filters.delegation = delegation;
      }

      const result = await this.queueService.getAvailableQueues(filters);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.queues
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getAvailableQueues controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get available locations for filtering
   * GET /api/queue/locations
   */
  async getAvailableLocations(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.queueService.getAvailableLocations();

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.governments
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getAvailableLocations controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get detailed queue for a specific destination
   * GET /api/queue/:destinationId
   */
  async getDestinationQueue(req: Request, res: Response): Promise<void> {
    try {
      const { destinationId } = req.params;

      if (!destinationId) {
        res.status(400).json({
          success: false,
          error: 'Destination ID is required'
        });
        return;
      }

      const result = await this.queueService.getDestinationQueue(destinationId);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.queue
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getDestinationQueue controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Update vehicle status in queue
   * PUT /api/queue/status
   */
  async updateVehicleStatus(req: Request, res: Response): Promise<void> {
    try {
      const { licensePlate, status } = req.body;

      // Validate input
      if (!licensePlate || !status) {
        res.status(400).json({
          success: false,
          error: 'License plate and status are required'
        });
        return;
      }

      // Validate status
      const validStatuses = ['WAITING', 'LOADING', 'READY', 'DEPARTED'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
        return;
      }

      const result = await this.queueService.updateVehicleStatus(licensePlate, status);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: `Vehicle ${licensePlate} status updated to ${status}`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in updateVehicleStatus controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get queue statistics
   * GET /api/queue/stats
   */
  async getQueueStats(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.queueService.getAvailableQueues();

      if (result.success && result.queues) {
        const stats = {
          totalDestinations: result.queues.length,
          totalVehicles: result.queues.reduce((sum: number, queue: any) => sum + queue.totalVehicles, 0),
          waitingVehicles: result.queues.reduce((sum: number, queue: any) => sum + queue.waitingVehicles, 0),
          loadingVehicles: result.queues.reduce((sum: number, queue: any) => sum + queue.loadingVehicles, 0),
          readyVehicles: result.queues.reduce((sum: number, queue: any) => sum + queue.readyVehicles, 0),
          destinations: result.queues
        };

        res.status(200).json({
          success: true,
          data: stats
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getQueueStats controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get available destinations for a vehicle
   * GET /api/queue/vehicle/:licensePlate/destinations
   */
  async getVehicleDestinations(req: Request, res: Response): Promise<void> {
    try {
      const { licensePlate } = req.params;

      if (!licensePlate) {
        res.status(400).json({
          success: false,
          message: 'License plate is required'
        });
        return;
      }

      const result = await this.queueService.getVehicleAvailableDestinations(licensePlate);

      if (result.success) {
        res.json({
          success: true,
          data: {
            licensePlate,
            destinations: result.destinations,
            defaultDestination: result.defaultDestination
          }
        });
      } else {
        res.status(404).json({
          success: false,
          message: result.error || 'Failed to get vehicle destinations'
        });
      }
    } catch (error) {
      console.error('❌ Error getting vehicle destinations:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export a function to create queue controller instance
export const createQueueController = () => {
  return new QueueController();
}; 