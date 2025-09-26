import { prisma } from '../config/database';
import { QueueEntry } from './queueService';
import cron from 'node-cron';
import { RouteService } from './routeService';
import { configService } from '../config/supervisorConfig';
import { getRedisService } from './redisService';
import { REDIS_KEYS } from '../config/redisConfig';

export interface OvernightQueueEntry {
  id: string;
  vehicleId: string;
  licensePlate: string;
  destinationId: string;
  destinationName: string;
  queuePosition: number;
  enteredAt: Date;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  vehicle?: {
    model?: string | undefined;
    color?: string | undefined;
    driver?: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
    } | undefined;
  } | undefined;
}

export interface StationOperatingHours {
  stationId: string;
  openTime: string; // Format: "HH:MM" (24-hour)
  closeTime: string; // Format: "HH:MM" (24-hour)
  isOpen: boolean;
}

export class OvernightQueueService {
  private currentStationId: string;
  private transferJobActive: boolean = false;
  private routeService: RouteService;

  constructor() {
    this.currentStationId = configService.getStationId();
    this.routeService = new RouteService();
    this.startBackgroundJobs();
  }

  /**
   * Add vehicle to overnight queue (Supervisor only)
   */
  async addToOvernightQueue(licensePlate: string, destinationId: string, supervisorId: string): Promise<{
    success: boolean;
    queueEntry?: OvernightQueueEntry;
    error?: string;
  }> {
    try {
      console.log(`🌙 Adding vehicle ${licensePlate} to overnight queue by supervisor ${supervisorId}`);

      // Find the vehicle in local database
      const vehicle = await prisma.vehicle.findUnique({
        where: { licensePlate },
        include: {
          authorizedStations: true
        }
      });

      if (!vehicle) {
        return {
          success: false,
          error: `Vehicle with license plate ${licensePlate} not found in local database`
        };
      }

      // Check if vehicle is active and available
      if (!vehicle.isActive) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not active`
        };
      }

      if (!vehicle.isAvailable) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not available for trips`
        };
      }

      // Validate that the provided destination exists in the routes
      const route = await prisma.route.findUnique({
        where: { stationId: destinationId }
      });

      if (!route) {
        return {
          success: false,
          error: `Destination ${destinationId} not found in routes`
        };
      }

      // Check if vehicle is authorized for the selected destination
      const isAuthorizedForDestination = vehicle.authorizedStations.some(
        auth => auth.stationId === destinationId
      );

      if (!isAuthorizedForDestination) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not authorized for destination ${route.stationName}`
        };
      }

      // Check if vehicle is already in any queue
      const existingQueueEntry = await prisma.vehicleQueue.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        }
      });

      let wasInRegularQueue = false;
      let regularQueueDestinationId = destinationId;

      if (existingQueueEntry) {
        if (existingQueueEntry.queueType === 'OVERNIGHT') {
          return {
            success: false,
            error: `Vehicle ${licensePlate} is already in overnight queue for ${existingQueueEntry.destinationName}`
          };
        } else {
          // Vehicle is in regular queue - we'll remove it and add to overnight queue
          wasInRegularQueue = true;
          regularQueueDestinationId = existingQueueEntry.destinationId;
          
          console.log(`🔄 Vehicle ${licensePlate} found in regular queue for ${existingQueueEntry.destinationName}, removing from regular queue...`);
          
          // Check if there are any bookings for this queue entry
          const bookings = await prisma.booking.findMany({
            where: { queueId: existingQueueEntry.id }
          });

          if (bookings.length > 0) {
            return {
              success: false,
              error: `Vehicle ${licensePlate} has ${bookings.length} active booking(s) and cannot be moved to overnight queue. Please cancel the bookings first.`
            };
          }
          
          // Delete from regular queue (now safe since no bookings exist)
          await prisma.vehicleQueue.delete({
            where: { id: existingQueueEntry.id }
          });

          // Reorder the regular queue after removal
          await this.reorderRegularQueue(regularQueueDestinationId);
          
          console.log(`✅ Vehicle ${licensePlate} removed from regular queue for ${existingQueueEntry.destinationName}`);
        }
      }

      // Use the route data we already fetched
      const destinationName = route.stationName;
      const basePrice = route.basePrice || 0;

      // Get the next position in the overnight queue for this destination
      const nextPosition = await this.getNextOvernightQueuePosition(destinationId);

      console.log(`✅ Using destination: ${destinationName} (${destinationId}) with base price: ${basePrice} TND`);

      // Create overnight queue entry
      const queueEntry = await prisma.vehicleQueue.create({
        data: {
          id: `overnight_${Date.now()}_${vehicle.id}`,
          vehicleId: vehicle.id,
          destinationId: destinationId,
          destinationName,
          queueType: 'OVERNIGHT',
          queuePosition: nextPosition,
          status: 'WAITING',
          enteredAt: new Date(),
          availableSeats: vehicle.capacity,
          totalSeats: vehicle.capacity,
          basePrice: basePrice
        },
        include: {
          vehicle: {
            include: {
              authorizedStations: true
            }
          }
        }
      });

      const message = wasInRegularQueue 
        ? `Vehicle ${licensePlate} moved from regular queue to overnight queue at position ${nextPosition} for ${destinationName}`
        : `Vehicle ${licensePlate} added to overnight queue at position ${nextPosition} for ${destinationName}`;

      console.log(`✅ ${message}`);

      // Broadcast updates for both queues if vehicle was moved from regular queue
      if (wasInRegularQueue) {
        this.broadcastQueueUpdate(regularQueueDestinationId);
      }
      this.broadcastOvernightQueueUpdate(destinationId);

      return {
        success: true,
        queueEntry: this.formatOvernightQueueEntry(queueEntry)
      };

    } catch (error) {
      console.error('❌ Error adding to overnight queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Remove vehicle from overnight queue (Supervisor only)
   */
  async removeFromOvernightQueue(licensePlate: string, supervisorId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🌙 Removing vehicle ${licensePlate} from overnight queue by supervisor ${supervisorId}`);

      // Find the vehicle
      const vehicle = await prisma.vehicle.findUnique({
        where: { licensePlate }
      });

      if (!vehicle) {
        return {
          success: false,
          error: `Vehicle with license plate ${licensePlate} not found`
        };
      }

      // Find overnight queue entry
      const queueEntry = await prisma.vehicleQueue.findFirst({
        where: {
          vehicleId: vehicle.id,
          queueType: 'OVERNIGHT',
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        }
      });

      if (!queueEntry) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not in overnight queue`
        };
      }

      const destinationId = queueEntry.destinationId;

      // Delete the queue entry
      await prisma.vehicleQueue.delete({
        where: { id: queueEntry.id }
      });

      // Reorder remaining vehicles in the same overnight destination queue
      await this.reorderOvernightQueue(destinationId);

      console.log(`✅ Vehicle ${licensePlate} removed from overnight queue for ${queueEntry.destinationName}`);

      // Invalidate Redis cache for this destination queue
      const redis = getRedisService();
      if (redis.getConnectionStatus()) {
        try {
          // Clear cached queue entries for this destination
          await redis.del(`${REDIS_KEYS.QUEUE}:${destinationId}`);
          console.log(`🗑️ Cleared Redis cache for overnight destination: ${destinationId}`);
        } catch (cacheError) {
          console.error('❌ Error clearing Redis cache:', cacheError);
        }
      }

      // Broadcast overnight queue update
      this.broadcastOvernightQueueUpdate(destinationId);

      return { success: true };

    } catch (error) {
      console.error('❌ Error removing from overnight queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all overnight queues
   */
  async getOvernightQueues(): Promise<{
    success: boolean;
    queues?: { [destinationId: string]: OvernightQueueEntry[] };
    error?: string;
  }> {
    try {
      const overnightEntries = await prisma.vehicleQueue.findMany({
        where: {
          queueType: 'OVERNIGHT',
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        include: {
          vehicle: {
            include: {
              authorizedStations: true
            }
          }
        },
        orderBy: [
          { destinationId: 'asc' },
          { queuePosition: 'asc' }
        ]
      });

      // Group by destination
      const queues: { [destinationId: string]: OvernightQueueEntry[] } = {};
      
      for (const entry of overnightEntries) {
        if (!queues[entry.destinationId]) {
          queues[entry.destinationId] = [];
        }
        queues[entry.destinationId].push(this.formatOvernightQueueEntry(entry));
      }

      return {
        success: true,
        queues
      };

    } catch (error) {
      console.error('❌ Error getting overnight queues:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get overnight queue for specific destination
   */
  async getOvernightQueueByDestination(destinationId: string): Promise<{
    success: boolean;
    queue?: OvernightQueueEntry[];
    error?: string;
  }> {
    try {
      const queueEntries = await prisma.vehicleQueue.findMany({
        where: {
          destinationId,
          queueType: 'OVERNIGHT',
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        include: {
          vehicle: {
            include: {
              authorizedStations: true
            }
          }
        },
        orderBy: {
          queuePosition: 'asc'
        }
      });

      const formattedEntries = queueEntries.map(entry => this.formatOvernightQueueEntry(entry));

      return {
        success: true,
        queue: formattedEntries
      };

    } catch (error) {
      console.error('❌ Error getting overnight queue by destination:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transfer overnight queue vehicles to regular queue (automatic when station opens)
   */
  async transferOvernightToRegular(): Promise<{
    success: boolean;
    transferred: number;
    error?: string;
  }> {
    try {
      if (this.transferJobActive) {
        console.log('⏰ Transfer job already in progress, skipping...');
        return { success: true, transferred: 0 };
      }

      this.transferJobActive = true;
      console.log('🌅 Starting automatic transfer of overnight queue to regular queue...');

      let totalTransferred = 0;

      // Get all overnight queue entries grouped by destination
      const overnightEntries = await prisma.vehicleQueue.findMany({
        where: {
          queueType: 'OVERNIGHT',
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        include: {
          vehicle: {
            include: {
              authorizedStations: true
            }
          }
        },
        orderBy: [
          { destinationId: 'asc' },
          { queuePosition: 'asc' }
        ]
      });

      // Group by destination for processing
      const destinationGroups: { [destinationId: string]: any[] } = {};
      for (const entry of overnightEntries) {
        if (!destinationGroups[entry.destinationId]) {
          destinationGroups[entry.destinationId] = [];
        }
        destinationGroups[entry.destinationId].push(entry);
      }

      // Process each destination separately
      for (const [destinationId, entries] of Object.entries(destinationGroups)) {
        try {
          // Get current highest position in regular queue for this destination
          const lastRegularEntry = await prisma.vehicleQueue.findFirst({
            where: {
              destinationId,
              queueType: 'REGULAR',
              status: { in: ['WAITING', 'LOADING', 'READY'] }
            },
            orderBy: {
              queuePosition: 'desc'
            }
          });

          let nextRegularPosition = (lastRegularEntry?.queuePosition || 0) + 1;

          // Transfer each overnight vehicle to regular queue with priority
          for (const entry of entries) {
            await prisma.vehicleQueue.update({
              where: { id: entry.id },
              data: {
                queueType: 'REGULAR',
                queuePosition: nextRegularPosition
              }
            });

            console.log(`✅ Transferred vehicle ${entry.vehicle.licensePlate} from overnight to regular queue at position ${nextRegularPosition} for ${entry.destinationName}`);
            
            nextRegularPosition++;
            totalTransferred++;
          }

          // Broadcast queue updates for this destination
          this.broadcastQueueUpdate(destinationId);
          this.broadcastOvernightQueueUpdate(destinationId);

        } catch (error) {
          console.error(`❌ Error transferring overnight queue for destination ${destinationId}:`, error);
        }
      }

      console.log(`🌅 Completed overnight queue transfer: ${totalTransferred} vehicles transferred`);

      this.transferJobActive = false;

      return {
        success: true,
        transferred: totalTransferred
      };

    } catch (error) {
      console.error('❌ Error in overnight queue transfer:', error);
      this.transferJobActive = false;
      return {
        success: false,
        transferred: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Start background jobs for automatic transfer
   */
  private startBackgroundJobs(): void {
    console.log('🤖 Starting overnight queue background jobs...');
    
    // Run every minute to check if station should open
    // In production, you might want to configure specific opening hours per station
    cron.schedule('* * * * *', async () => {
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      
      // Default station hours: open at 6:00 AM
      // You can make this configurable per station
      if (currentHour === 6 && currentMinute === 0) {
        console.log('🌅 Station opening time detected, initiating overnight queue transfer...');
        await this.transferOvernightToRegular();
      }
    });

    // Also run a check every 30 minutes during the day for any missed transfers
    cron.schedule('*/30 6-18 * * *', async () => {
      const overnightCount = await prisma.vehicleQueue.count({
        where: {
          queueType: 'OVERNIGHT',
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        }
      });

      if (overnightCount > 0) {
        console.log(`🔄 Found ${overnightCount} vehicles in overnight queue during operating hours, transferring...`);
        await this.transferOvernightToRegular();
      }
    });
  }

  /**
   * Get next position in overnight queue for a destination
   */
  private async getNextOvernightQueuePosition(destinationId: string): Promise<number> {
    const lastEntry = await prisma.vehicleQueue.findFirst({
      where: {
        destinationId,
        queueType: 'OVERNIGHT',
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      orderBy: {
        queuePosition: 'desc'
      }
    });

    return (lastEntry?.queuePosition || 0) + 1;
  }

  /**
   * Reorder overnight queue after vehicle removal
   */
  private async reorderOvernightQueue(destinationId: string): Promise<void> {
    const remainingEntries = await prisma.vehicleQueue.findMany({
      where: {
        destinationId,
        queueType: 'OVERNIGHT',
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      orderBy: {
        queuePosition: 'asc'
      }
    });

    // Update positions to be sequential
    for (let i = 0; i < remainingEntries.length; i++) {
      await prisma.vehicleQueue.update({
        where: { id: remainingEntries[i].id },
        data: { queuePosition: i + 1 }
      });
    }
  }

  /**
   * Reorder regular queue after vehicle removal
   */
  private async reorderRegularQueue(destinationId: string): Promise<void> {
    const remainingEntries = await prisma.vehicleQueue.findMany({
      where: {
        destinationId,
        queueType: 'REGULAR',
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      orderBy: {
        queuePosition: 'asc'
      }
    });

    // Update positions to be sequential
    for (let i = 0; i < remainingEntries.length; i++) {
      await prisma.vehicleQueue.update({
        where: { id: remainingEntries[i].id },
        data: { queuePosition: i + 1 }
      });
    }
  }

  /**
   * Get destination name from route table
   */
  private async getDestinationName(destinationId: string): Promise<string> {
    return await this.routeService.getStationNameById(destinationId);
  }

  /**
   * Format queue entry for response
   */
  private formatOvernightQueueEntry(entry: any): OvernightQueueEntry {
    return {
      id: entry.id,
      vehicleId: entry.vehicleId,
      licensePlate: entry.vehicle.licensePlate,
      destinationId: entry.destinationId,
      destinationName: entry.destinationName,
      queuePosition: entry.queuePosition,
      enteredAt: entry.enteredAt,
      availableSeats: entry.availableSeats,
      totalSeats: entry.totalSeats,
      basePrice: entry.basePrice,
    };
  }

  /**
   * Broadcast overnight queue update via local WebSocket
   */
  private broadcastOvernightQueueUpdate(destinationId: string): void {
    try {
      // Broadcast using local WebSocket server

      // Send to local WebSocket server for desktop app updates
      // We need to get the local WebSocket server instance
      // WebSocket functionality removed - notifications handled via API polling
      console.log(`Overnight queue update: ${destinationId}`);
    } catch (error) {
      console.error('❌ Error broadcasting overnight queue update:', error);
    }
  }

  /**
   * Broadcast regular queue update via WebSocket
   */
  private broadcastQueueUpdate(destinationId: string): void {
    try {
      // Emit real-time update for queue changes


      // WebSocket functionality removed - notifications handled via API polling
      console.log(`Queue update: ${destinationId}`);
    } catch (error) {
      console.error('❌ Error broadcasting queue update:', error);
    }
  }
}

export const createOvernightQueueService = () => {
  return new OvernightQueueService();
}; 