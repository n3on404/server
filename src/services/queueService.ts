import { prisma } from '../config/database';
import * as dashboardController from '../controllers/dashboardController';
import { RouteService } from './routeService';
import { configService } from '../config/supervisorConfig';
import { getRedisService } from './redisService';
import { REDIS_KEYS, CACHE_TTL } from '../config/redisConfig';
import { getMQTTService } from './mqttService';

export interface QueueEntry {
  id: string;
  vehicleId: string;
  licensePlate: string;
  destinationId: string;
  destinationName: string;
  queuePosition: number;
  status: 'WAITING' | 'LOADING' | 'READY' | 'DEPARTED';
  enteredAt: Date;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  estimatedDeparture?: Date;
  actualDeparture?: Date;
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

export interface QueueSummary {
  destinationId: string;
  destinationName: string;
  totalVehicles: number;
  waitingVehicles: number;
  loadingVehicles: number;
  readyVehicles: number;
  estimatedNextDeparture?: Date | undefined;
  governorate?: string | undefined;
  governorateAr?: string | undefined;
  delegation?: string | undefined;
  delegationAr?: string | undefined;
}


// Function to notify about queue updates with Redis
async function notifyQueueUpdate(queue: any) {
  const redis = getRedisService();
  
  if (redis.getConnectionStatus()) {
    // Cache queue data in Redis
    await redis.cacheQueueEntries(queue.destinationId, [queue]);
    
    // Publish real-time update
    await redis.publish(`${REDIS_KEYS.LIVE_QUEUE}${queue.destinationId}`, {
      type: 'queue_update',
      data: queue,
      timestamp: new Date().toISOString()
    });
    
    // Update live queue statistics
    await redis.incrementDailyStats('queue_updates');
    
    console.log(`✅ Queue update cached and published for ${queue.destinationName}`);
  }
  
  console.log(`Queue update: ${queue.id} - ${queue.destinationName} - ${queue.status}`);
}

export class QueueService {
  private currentStationId: string;
  private routeService: RouteService;

  constructor() {
    this.currentStationId = configService.getStationId();
    this.routeService = new RouteService();
  }

  /**
   * Enter a vehicle into a queue with specified parameters
   */
  async enterQueue(
    licensePlate: string, 
    options?: {
      destinationId?: string;
      destinationName?: string;
      availableSeats?: number;
      totalSeats?: number;
      basePrice?: number;
      driverInfo?: {
        firstName: string;
        lastName: string;
        phoneNumber: string;
      };
      vehicleInfo?: {
        model?: string;
        color?: string;
      };
    }
  ): Promise<{
    success: boolean;
    queueEntry?: QueueEntry;
    error?: string;
    movedFromQueue?: boolean;
    previousDestination?: string;
  }> {
    try {
      console.log(`🚗 Vehicle ${licensePlate} entering queue`);
      
      // Find or create the vehicle in local database
      let vehicle = await prisma.vehicle.findUnique({
        where: { licensePlate },
        include: {
          authorizedStations: true
        }
      });

      // If vehicle doesn't exist and we have driver info, create it
      if (!vehicle && options?.driverInfo) {
        console.log(`Creating new vehicle ${licensePlate}`);
        
        // Generate ID for new vehicle
        const vehicleId = `vehicle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Create vehicle directly - no driver needed
        vehicle = await prisma.vehicle.create({
          data: {
            id: vehicleId,
            licensePlate,
            capacity: options.totalSeats || 4,
            isActive: true,
            isAvailable: true,
            // Set default destination if provided
            defaultDestinationId: options.destinationId || null,
            defaultDestinationName: options.destinationName || null,
            // Authorize for current station and destination
            authorizedStations: {
              create: [
                { 
                  stationId: this.currentStationId,
                  stationName: await this.getDestinationName(this.currentStationId),
                  priority: 99, // Current station has lowest priority for destinations
                  isDefault: false
                },
                ...(options.destinationId ? [{ 
                  stationId: options.destinationId,
                  stationName: options.destinationName || await this.getDestinationName(options.destinationId),
                  priority: 1, // First authorized destination has highest priority
                  isDefault: true
                }] : [])
              ]
            }
          },
          include: {
            authorizedStations: true
          }
        });
        
        console.log(`✅ Created new vehicle ${licensePlate}`);
      }

      if (!vehicle) {
        return {
          success: false,
          error: `Vehicle with license plate ${licensePlate} not found and couldn't be created`
        };
      }

      // Check if vehicle is active and available
      if (!vehicle.isActive) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not active`
        };
      }

      // Driver validation removed - simplified to vehicle-only system

      // Determine destination with enhanced logic FIRST
      let destinationId: string | undefined;
      let destinationName: string | undefined;
      
      if (options?.destinationId) {
        // Use provided destination (staff override)
        destinationId = options.destinationId;
        destinationName = options.destinationName || await this.getDestinationName(destinationId);
        
        // Ensure vehicle is authorized for this destination
        const isAuthorized = vehicle.authorizedStations.some(auth => auth.stationId === destinationId);
        
        if (!isAuthorized) {
          return {
            success: false,
            error: `Vehicle ${licensePlate} is not authorized for destination ${destinationName}. Please contact a supervisor to add this authorization.`
          };
        }
      } else {
        // Use smart destination selection logic
        
        // First, try to use vehicle's default destination
        if (vehicle.defaultDestinationId) {
          const defaultAuth = vehicle.authorizedStations.find(
            auth => auth.stationId === vehicle.defaultDestinationId && auth.stationId !== this.currentStationId
          );
          
          if (defaultAuth) {
            destinationId = vehicle.defaultDestinationId;
            destinationName = vehicle.defaultDestinationName || await this.getDestinationName(destinationId);
            console.log(`📍 Using vehicle's default destination: ${destinationName}`);
          }
        }
        
        // If no default destination or it's not available, use priority-based selection
        if (!destinationId) {
          // Get authorized stations excluding current station, ordered by priority
          const availableDestinations = vehicle.authorizedStations
            .filter(auth => auth.stationId !== this.currentStationId)
            .sort((a, b) => a.priority - b.priority); // Lower priority number = higher priority
          
          if (availableDestinations.length === 0) {
            return {
              success: false,
              error: `Vehicle ${licensePlate} has no authorized destination stations (other than current station)`
            };
          }
          
          const selectedAuth = availableDestinations[0];
          destinationId = selectedAuth.stationId;
          destinationName = selectedAuth.stationName || await this.getDestinationName(destinationId);
          console.log(`🎯 Using highest priority destination: ${destinationName} (priority ${selectedAuth.priority})`);
                 }
      }

      // Ensure we have a valid destination
      if (!destinationId || !destinationName) {
        return {
          success: false,
          error: `Unable to determine destination for vehicle ${licensePlate}`
        };
      }

      // Now check if vehicle is already in a queue (after destination is determined)
      const existingQueueEntry = await prisma.vehicleQueue.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        include: {
          bookings: {
            where: {
              paymentStatus: { in: ['PAID', 'PENDING'] }
            }
          }
        }
      });

      let movedFromQueue = false;
      let previousDestination = '';

      if (existingQueueEntry) {
        // Only allow moving/changing destination when status is WAITING
        if (existingQueueEntry.status !== 'WAITING') {
          return {
            success: false,
            error: `Cannot change destination for vehicle ${licensePlate} unless status is WAITING (current: ${existingQueueEntry.status})`
          };
        }

        // If trying to enter same destination queue, return error
        if (existingQueueEntry.destinationId === destinationId) {
          return {
            success: false,
            error: `Vehicle ${licensePlate} is already in queue for ${existingQueueEntry.destinationName}`
          };
        }

        // Check if vehicle has active bookings
        if (existingQueueEntry.bookings.length > 0) {
          const totalBookedSeats = existingQueueEntry.bookings.reduce((sum, booking) => sum + booking.seatsBooked, 0);
          return {
            success: false,
            error: `Cannot move vehicle ${licensePlate} from ${existingQueueEntry.destinationName} queue: ${totalBookedSeats} seats are already booked. Please handle existing bookings first.`
          };
        }

        // Vehicle is in different queue with no bookings - move it
        console.log(`🔄 Moving vehicle ${licensePlate} from ${existingQueueEntry.destinationName} to ${destinationName} queue`);
        previousDestination = existingQueueEntry.destinationName;
        const previousDestinationId = existingQueueEntry.destinationId;

        // Remove from current queue
        await prisma.vehicleQueue.delete({
          where: { id: existingQueueEntry.id }
        });

        // Reorder the queue it was removed from
        await this.reorderQueue(previousDestinationId);
        
        // Broadcast update for the queue it left
        this.broadcastQueueUpdate(previousDestinationId);

        movedFromQueue = true;
        console.log(`✅ Vehicle ${licensePlate} removed from ${previousDestination} queue`);
      }

      // At this point we have a valid destination and have handled any queue moves

      // Get the correct base price from the route table
      let basePrice = options?.basePrice || 0;
      
      if (!options?.basePrice) {
        // Try to get base price from route table for this destination
        try {
          const route = await prisma.route.findUnique({
            where: { stationId: destinationId }
          });
          
          if (route && route.basePrice > 0) {
            basePrice = route.basePrice;
            console.log(`✅ Found base price for ${destinationName}: ${basePrice} TND`);
          } else {
            console.warn(`⚠️ No route found for destination ${destinationName} (${destinationId}), using default price`);
          }
        } catch (error) {
          console.error(`❌ Error fetching route price for ${destinationName}:`, error);
        }
      }

      // Get the next position in the queue for this destination
      const nextPosition = await this.getNextQueuePosition(destinationId);

      // Create queue entry
      const queueEntry = await prisma.vehicleQueue.create({
        data: {
          id: `queue_${Date.now()}_${vehicle.id}`,
          vehicleId: vehicle.id,
          destinationId,
          destinationName,
          queuePosition: nextPosition,
          status: 'WAITING',
          enteredAt: new Date(),
          availableSeats: options?.availableSeats || vehicle.capacity,
          totalSeats: options?.totalSeats || vehicle.capacity,
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

      if (movedFromQueue) {
        console.log(`✅ Vehicle ${licensePlate} moved from ${previousDestination} to ${destinationName} queue at position ${nextPosition} with base price ${basePrice} TND`);
      } else {
      console.log(`✅ Vehicle ${licensePlate} entered queue at position ${nextPosition} for ${destinationName} with base price ${basePrice} TND`);
      }

      // Broadcast queue update
      this.broadcastQueueUpdate(destinationId);

      // Notify clients about queue updates
      notifyQueueUpdate(queueEntry);

      // Publish MQTT events
      const mqttService = getMQTTService();
      
      if (movedFromQueue) {
        await mqttService.publishQueueUpdate(configService.getStationId(), {
          stationId: configService.getStationId(),
          stationName: configService.getStationName(),
          action: 'vehicle_transferred',
          vehicle: {
            licensePlate,
            destinationId,
            destinationName,
            queuePosition: nextPosition,
            availableSeats: options?.availableSeats || vehicle.capacity,
            totalSeats: options?.totalSeats || vehicle.capacity
          },
          timestamp: new Date().toISOString()
        });
      } else {
        await mqttService.publishQueueUpdate(configService.getStationId(), {
          stationId: configService.getStationId(),
          stationName: configService.getStationName(),
          action: 'vehicle_added',
          vehicle: {
            licensePlate,
            destinationId,
            destinationName,
            queuePosition: nextPosition,
            availableSeats: options?.availableSeats || vehicle.capacity,
            totalSeats: options?.totalSeats || vehicle.capacity
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Publish seat availability update
      const availableSeats = await this.getAvailableSeatsForDestination(destinationId);
      await mqttService.publishSeatAvailability(destinationId, {
        destinationId,
        destinationName,
        availableSeats,
        totalSeats: options?.totalSeats || vehicle.capacity,
        timestamp: new Date().toISOString()
      });
      
      // Publish destinations update
      const destinations = await this.getDestinationsWithAvailability();
      await mqttService.publishDestinationsUpdate({
        destinations,
        timestamp: new Date().toISOString()
      });

      const result: {
        success: true;
        queueEntry: QueueEntry;
        movedFromQueue?: boolean;
        previousDestination?: string;
      } = {
        success: true,
        queueEntry: this.formatQueueEntry(queueEntry)
      };

      if (movedFromQueue) {
        result.movedFromQueue = true;
        result.previousDestination = previousDestination;
      }

      return result;

    } catch (error) {
      console.error('❌ Error entering queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Exit a vehicle from the queue
   */
  async exitQueue(licensePlate: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🚗 Vehicle ${licensePlate} exiting queue`);

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

      // Find active queue entry
      const queueEntry = await prisma.vehicleQueue.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        include: {
          vehicle: true
        }
      });

      if (!queueEntry) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not in any active queue`
        };
      }

      // Only allow deletion when status is WAITING
      if (queueEntry.status !== 'WAITING') {
        return {
          success: false,
          error: `Vehicle ${licensePlate} cannot be removed unless status is WAITING (current: ${queueEntry.status})`
        };
      }

      // Check for active bookings
      const activeBookings = await prisma.booking.count({
        where: {
          queueId: queueEntry.id,
          paymentStatus: { in: ['PAID', 'PENDING'] }
        }
      });

      if (activeBookings > 0) {
        console.log(`⚠️ Vehicle ${licensePlate} has ${activeBookings} active bookings, proceeding with cascade delete`);
        // Note: With cascade delete in Prisma schema, related bookings will be automatically deleted
      }

      const destinationId = queueEntry.destinationId;

      // Delete the queue entry
      await prisma.vehicleQueue.delete({
        where: { id: queueEntry.id }
      });

      // Reorder remaining vehicles in the same destination queue
      await this.reorderQueue(destinationId);

      console.log(`✅ Vehicle ${licensePlate} exited queue for ${queueEntry.destinationName}`);

      // Invalidate Redis cache for this destination queue
      const redis = getRedisService();
      if (redis.getConnectionStatus()) {
        try {
          // Clear cached queue entries for this destination
          await redis.del(`${REDIS_KEYS.QUEUE}:${destinationId}`);
          console.log(`🗑️ Cleared Redis cache for destination: ${destinationId}`);
        } catch (cacheError) {
          console.error('❌ Error clearing Redis cache:', cacheError);
        }
      }

      // Broadcast queue update
      this.broadcastQueueUpdate(destinationId);

      // Publish MQTT events
      const mqttService = getMQTTService();
      
      await mqttService.publishQueueUpdate(configService.getStationId(), {
        stationId: configService.getStationId(),
        stationName: configService.getStationName(),
        action: 'vehicle_removed',
        vehicle: {
          licensePlate: queueEntry.vehicle.licensePlate,
          destinationId: queueEntry.destinationId,
          destinationName: queueEntry.destinationName,
          queuePosition: queueEntry.queuePosition,
          availableSeats: 0,
          totalSeats: 0
        },
        timestamp: new Date().toISOString()
      });
      
      // Publish seat availability update
      const availableSeats = await this.getAvailableSeatsForDestination(destinationId);
      await mqttService.publishSeatAvailability(destinationId, {
        destinationId: queueEntry.destinationId,
        destinationName: queueEntry.destinationName,
        availableSeats,
        totalSeats: 0,
        timestamp: new Date().toISOString()
      });
      
      // Publish destinations update
      const destinations = await this.getDestinationsWithAvailability();
      await mqttService.publishDestinationsUpdate({
        destinations,
        timestamp: new Date().toISOString()
      });

      return { success: true };

    } catch (error) {
      console.error('❌ Error exiting queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all available destination queues with optional filtering
   */
  async getAvailableQueues(filters?: {
    governorate?: string;
    delegation?: string;
  }): Promise<{
    success: boolean;
    queues?: QueueSummary[];
    error?: string;
  }> {
    try {
      // First get all unique destinations from routes table to avoid duplication
      const allRoutes = await prisma.route.findMany({
        where: {
          isActive: true
        },
        select: {
          stationId: true,
          stationName: true,
          governorate: true,
          governorateAr: true,
          delegation: true,
          delegationAr: true
        }
      });

      // Get queue data for each destination
      const destinationsWithQueues = await Promise.all(
        allRoutes.map(async (route) => {
          const queueData = await prisma.vehicleQueue.groupBy({
            by: ['destinationId', 'destinationName'],
            where: {
              destinationId: route.stationId,
              status: { in: ['WAITING', 'LOADING', 'READY'] }
            },
            _count: {
              id: true
            },
            _min: {
              estimatedDeparture: true
            }
          });

          if (queueData.length === 0) {
            return null; // No active queues for this destination
          }

          const queue = queueData[0];
          const statusCounts = await prisma.vehicleQueue.groupBy({
            by: ['status'],
            where: {
              destinationId: route.stationId,
              status: { in: ['WAITING', 'LOADING', 'READY'] }
            },
            _count: {
              id: true
            }
          });

          const summary: QueueSummary = {
            destinationId: route.stationId,
            destinationName: route.stationName,
            totalVehicles: queue._count.id,
            waitingVehicles: 0,
            loadingVehicles: 0,
            readyVehicles: 0,
            estimatedNextDeparture: queue._min.estimatedDeparture || undefined,
            governorate: route.governorate || undefined,
            governorateAr: route.governorateAr || undefined,
            delegation: route.delegation || undefined,
            delegationAr: route.delegationAr || undefined
          };

          // Count vehicles by status
          for (const statusCount of statusCounts) {
            switch (statusCount.status) {
              case 'WAITING':
                summary.waitingVehicles = statusCount._count.id;
                break;
              case 'LOADING':
                summary.loadingVehicles = statusCount._count.id;
                break;
              case 'READY':
                summary.readyVehicles = statusCount._count.id;
                break;
            }
          }

          return summary;
        })
      );

      // Filter out null entries (destinations with no active queues)
      let queueSummaries = destinationsWithQueues.filter((summary): summary is QueueSummary => summary !== null);

      // Apply filters if provided
      if (filters?.governorate) {
        queueSummaries = queueSummaries.filter(summary => 
          summary.governorate === filters.governorate
        );
      }
      if (filters?.delegation) {
        queueSummaries = queueSummaries.filter(summary => 
          summary.delegation === filters.delegation
        );
      }

      return {
        success: true,
        queues: queueSummaries
      };

    } catch (error) {
      console.error('❌ Error getting available queues:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get available locations for filtering
   */
  async getAvailableLocations(): Promise<{
    success: boolean;
    governments?: Array<{
      name: string;
      nameAr?: string | undefined;
      delegations: Array<{
        name: string;
        nameAr?: string | undefined;
      }>;
    }>;
    error?: string;
  }> {
    try {
      console.log('📍 Getting available locations for queue filtering...');
      
      // Get all unique governments and delegations from routes
      const routes = await prisma.route.findMany({
        where: {
          isActive: true,
          governorate: { not: null },
          delegation: { not: null }
        },
        select: {
          governorate: true,
          governorateAr: true,
          delegation: true,
          delegationAr: true
        },
        distinct: ['governorate', 'delegation'] // Ensure unique combinations
      });

      // Group by government
      const governmentMap = new Map<string, {
        name: string;
        nameAr?: string | undefined;
        delegations: Map<string, { name: string; nameAr?: string | undefined; }>;
      }>();

      for (const route of routes) {
        if (!route.governorate || !route.delegation) continue;

        // Get or create government
        if (!governmentMap.has(route.governorate)) {
          governmentMap.set(route.governorate, {
            name: route.governorate,
            nameAr: route.governorateAr ? route.governorateAr : undefined,
            delegations: new Map()
          });
        }

        const government = governmentMap.get(route.governorate)!;

        // Add delegation if not already present
        if (!government.delegations.has(route.delegation)) {
          government.delegations.set(route.delegation, {
            name: route.delegation,
            nameAr: route.delegationAr ? route.delegationAr : undefined
          });
        }
      }

      // Convert to array format
      const governments = Array.from(governmentMap.values()).map(gov => ({
        name: gov.name,
        nameAr: gov.nameAr ? gov.nameAr : undefined,
        delegations: Array.from(gov.delegations.values())
      }));

      console.log(`✅ Found ${governments.length} governments with locations for queue filtering`);

      return {
        success: true,
        governments
      };

    } catch (error) {
      console.error('❌ Error getting available locations for queue filtering:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get detailed queue for a specific destination
   */
  async getDestinationQueue(destinationId: string): Promise<{
    success: boolean;
    queue?: QueueEntry[];
    error?: string;
  }> {
    try {
      console.log(`🔍 Getting queue for destination: ${destinationId}`);

      // Get queue entries for this destination
      const queueEntries = await prisma.vehicleQueue.findMany({
        where: {
          destinationId,
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

      // Format queue entries
      const formattedQueue = queueEntries.map(entry => this.formatQueueEntry(entry));

      console.log(`✅ Found ${formattedQueue.length} vehicles in queue for destination ${destinationId}`);

      return {
        success: true,
        queue: formattedQueue
      };

    } catch (error) {
      console.error('❌ Error getting destination queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Automatically update vehicle status based on booking activity
   * This method should be called after any booking is created or updated
   */
  async updateVehicleStatusBasedOnBookings(queueId: string, staffId?: string): Promise<{
    success: boolean;
    statusChanged?: boolean;
    newStatus?: string;
    exitPass?: {
      currentExitPass: any;
      totalAmount: any;
      previousExitPass: any;
    };
    error?: string;
  }> {
    try {
      // Get the current queue entry with booking information
      const queueEntry = await prisma.vehicleQueue.findUnique({
        where: { id: queueId },
        include: {
          vehicle: true,
          bookings: {
            where: {
              paymentStatus: { in: ['PAID', 'PENDING'] }
            }
          }
        }
      });

      if (!queueEntry) {
        return {
          success: false,
          error: `Queue entry ${queueId} not found`
        };
      }

      const currentStatus = queueEntry.status;
      const availableSeats = queueEntry.availableSeats;
      const totalSeats = queueEntry.totalSeats;
      const totalBookedSeats = queueEntry.bookings.reduce((sum, booking) => sum + booking.seatsBooked, 0);
      const occupiedSeats = totalSeats - availableSeats;

      console.log(`🔍 Checking status for vehicle ${queueEntry.vehicle.licensePlate}:`);
      console.log(`   Current status: ${currentStatus}`);
      console.log(`   Available seats: ${availableSeats}`);
      console.log(`   Total seats: ${totalSeats}`);
      console.log(`   Occupied seats: ${occupiedSeats}`);
      console.log(`   Booked seats: ${totalBookedSeats}`);

      let newStatus = currentStatus;
      let statusChanged = false;

      // Determine new status based on seat occupancy
      if (availableSeats === totalSeats) {
        // No seats occupied - should be WAITING
        if (currentStatus !== 'WAITING') {
          newStatus = 'WAITING';
          statusChanged = true;
          console.log(`🔄 Vehicle ${queueEntry.vehicle.licensePlate} status: ${currentStatus} → WAITING (no passengers)`);
        }
      } else if (availableSeats > 0) {
        // Some seats occupied but not full - should be LOADING
        if (currentStatus !== 'LOADING') {
          newStatus = 'LOADING';
          statusChanged = true;
          console.log(`🔄 Vehicle ${queueEntry.vehicle.licensePlate} status: ${currentStatus} → LOADING (${occupiedSeats}/${totalSeats} seats occupied)`);
        }
      } else {
        // All seats occupied - should be READY
        if (currentStatus !== 'READY') {
          newStatus = 'READY';
          statusChanged = true;
          console.log(`🔄 Vehicle ${queueEntry.vehicle.licensePlate} status: ${currentStatus} → READY (fully loaded - ${totalSeats}/${totalSeats} seats)`);
        }
      }

      // Update status if it changed
      if (statusChanged) {
        const updatedQueue = await prisma.vehicleQueue.update({
          where: { id: queueId },
          data: {
            status: newStatus,
            ...(newStatus === 'READY' && !queueEntry.estimatedDeparture && {
              estimatedDeparture: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
            })
          },
          include: { vehicle: true }
        });

        console.log(`✅ Vehicle ${queueEntry.vehicle.licensePlate} status updated to ${newStatus}`);

        // Broadcast the status change
        this.broadcastQueueUpdate(queueEntry.destinationId);

        // Notify clients about status change
        notifyQueueUpdate({
          ...queueEntry,
          status: newStatus
        });

        // If vehicle is now fully booked (READY with 0 available seats), create exit pass and remove from queue
        if (newStatus === 'READY' && updatedQueue.availableSeats === 0) {
          console.log(`🚌 [BACKEND DEBUG] Vehicle ${updatedQueue.vehicle.licensePlate} fully booked; creating exit pass`);

          // Find previous exit pass today for same destination
          const startOfDay = new Date();
          startOfDay.setHours(0,0,0,0);
          const endOfDay = new Date();
          endOfDay.setHours(23,59,59,999);

          // Determine a valid staff to attribute the exit pass to
          const creatorStaffId = staffId || (await prisma.staff.findFirst({ select: { id: true } }))?.id;
          if (!creatorStaffId) {
            throw new Error('No valid staff found to attribute exit pass (createdBy)');
          }

          const currentExitPass = await prisma.exitPass.create({
            data: {
              queueId: updatedQueue.id,
              vehicleId: updatedQueue.vehicleId,
              licensePlate: updatedQueue.vehicle.licensePlate,
              destinationId: updatedQueue.destinationId,
              destinationName: updatedQueue.destinationName,
              currentExitTime: new Date(),
              createdBy: creatorStaffId
            }
          });

          const previousExitPass = await prisma.exitPass.findFirst({
            where: {
              destinationId: updatedQueue.destinationId,
              destinationName: updatedQueue.destinationName,
              currentExitTime: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lte: new Date(new Date().setHours(23, 59, 59, 999))
              }
            },
            orderBy: { currentExitTime: 'desc' }
          });
          //search in the route
          const routeInfo = await prisma.route.findFirst({
            where :{
              stationId : updatedQueue.destinationId
            }
            
          })
          let totalAmount = 0.0;
          if (routeInfo){
            const totalPrice = routeInfo.basePrice * updatedQueue.vehicle.capacity;
            totalAmount = totalPrice;
          }

          // Remove from queue
          await prisma.vehicleQueue.delete({ where: { id: updatedQueue.id } });
          await this.reorderQueue(updatedQueue.destinationId);

          // Broadcast updates
          this.broadcastQueueUpdate(updatedQueue.destinationId);

          return {
            success: true,
            statusChanged,
            newStatus,
            exitPass: { currentExitPass,  totalAmount, previousExitPass }
          };
        } else {
          console.log(`🚌 [BACKEND DEBUG] Vehicle ${queueEntry.vehicle.licensePlate} not fully booked yet: newStatus=${newStatus}, availableSeats=${availableSeats}`);
        }
      }

      return {
        success: true,
        statusChanged,
        newStatus: statusChanged ? newStatus : currentStatus
      };

    } catch (error) {
      console.error('❌ Error updating vehicle status based on bookings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update vehicle status in queue (manual status update)
   */
  async updateVehicleStatus(licensePlate: string, status: 'WAITING' | 'LOADING' | 'READY' | 'DEPARTED'): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔄 Updating vehicle ${licensePlate} status to ${status}`);

      const vehicle = await prisma.vehicle.findUnique({
        where: { licensePlate }
      });

      if (!vehicle) {
        return {
          success: false,
          error: `Vehicle with license plate ${licensePlate} not found`
        };
      }

      const queueEntry = await prisma.vehicleQueue.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        }
      });

      if (!queueEntry) {
        return {
          success: false,
          error: `Vehicle ${licensePlate} is not in any active queue`
        };
      }

      // Update status
      await prisma.vehicleQueue.update({
        where: { id: queueEntry.id },
        data: {
          status,
          ...(status === 'DEPARTED' && { actualDeparture: new Date() })
        }
      });

      // If vehicle departed, remove from queue and reorder
      if (status === 'DEPARTED') {
        await prisma.vehicleQueue.delete({
          where: { id: queueEntry.id }
        });
        await this.reorderQueue(queueEntry.destinationId);
      }

      console.log(`✅ Vehicle ${licensePlate} status updated to ${status}`);

      // Broadcast queue update
      this.broadcastQueueUpdate(queueEntry.destinationId);

      // Notify clients about queue updates
      notifyQueueUpdate(queueEntry);

      return { success: true };

    } catch (error) {
      console.error('❌ Error updating vehicle status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get next position in queue for a destination
   */
  private async getNextQueuePosition(destinationId: string): Promise<number> {
    const lastEntry = await prisma.vehicleQueue.findFirst({
      where: {
        destinationId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      orderBy: {
        queuePosition: 'desc'
      }
    });

    return (lastEntry?.queuePosition || 0) + 1;
  }

  /**
   * Reorder queue after vehicle removal
   */
  private async reorderQueue(destinationId: string): Promise<void> {
    const queueEntries = await prisma.vehicleQueue.findMany({
      where: {
        destinationId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      orderBy: {
        enteredAt: 'asc'
      }
    });

    // Update positions
    for (let i = 0; i < queueEntries.length; i++) {
      await prisma.vehicleQueue.update({
        where: { id: queueEntries[i].id },
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
   * Format queue entry for API response
   */
  private formatQueueEntry(entry: any): QueueEntry {
    return {
      id: entry.id,
      vehicleId: entry.vehicleId,
      licensePlate: entry.vehicle.licensePlate,
      destinationId: entry.destinationId,
      destinationName: entry.destinationName,
      queuePosition: entry.queuePosition,
      status: entry.status,
      enteredAt: entry.enteredAt,
      availableSeats: entry.availableSeats,
      totalSeats: entry.totalSeats,
      basePrice: entry.basePrice,
      estimatedDeparture: entry.estimatedDeparture,
      actualDeparture: entry.actualDeparture,
      vehicle: entry.vehicle ? {
        model: entry.vehicle.model || undefined,
        color: entry.vehicle.color || undefined,
        // Driver info removed - simplified to vehicle-only system
      } : undefined
    };
  }

  /**
   * Broadcast queue update (websocket functionality removed)
   */
  private broadcastQueueUpdate(destinationId: string): void {
    // WebSocket functionality removed - notifications handled via API polling
    console.log(`Queue update broadcast for destination: ${destinationId}`);
  }

  /**
   * Get available destinations for a vehicle (for staff to choose from)
   */
  async getVehicleAvailableDestinations(licensePlate: string): Promise<{
    success: boolean;
    destinations?: Array<{
      stationId: string;
      stationName: string;
      priority: number;
      isDefault: boolean;
      basePrice: number;
    }>;
    defaultDestination?: {
      stationId: string;
      stationName: string;
    };
    error?: string;
  }> {
    try {
      console.log(`🔍 Getting available destinations for vehicle ${licensePlate}`);

      // Find the vehicle
      const vehicle = await prisma.vehicle.findUnique({
        where: { licensePlate },
        include: {
          authorizedStations: {
            orderBy: {
              priority: 'asc' // Lower priority number = higher priority
            }
          }
        }
      });

      if (!vehicle) {
        return {
          success: false,
          error: `Vehicle with license plate ${licensePlate} not found`
        };
      }

      // Filter out current station and prepare destinations with route pricing
      const availableDestinations = [];
      
      for (const auth of vehicle.authorizedStations) {
        if (auth.stationId === this.currentStationId) continue;
        
        // Get route pricing for this destination
        let basePrice = 0;
        try {
          const route = await prisma.route.findUnique({
            where: { stationId: auth.stationId }
          });
          basePrice = route?.basePrice || 0;
        } catch (error) {
          console.warn(`⚠️ Could not fetch price for station ${auth.stationId}`);
        }

        availableDestinations.push({
          stationId: auth.stationId,
          stationName: auth.stationName || await this.getDestinationName(auth.stationId),
          priority: auth.priority,
          isDefault: auth.isDefault,
          basePrice
        });
      }

      const result: {
        success: boolean;
        destinations: Array<{
          stationId: string;
          stationName: string;
          priority: number;
          isDefault: boolean;
          basePrice: number;
        }>;
        defaultDestination?: {
          stationId: string;
          stationName: string;
        };
      } = {
        success: true,
        destinations: availableDestinations
      };

      if (vehicle.defaultDestinationId) {
        result.defaultDestination = {
          stationId: vehicle.defaultDestinationId,
          stationName: vehicle.defaultDestinationName || await this.getDestinationName(vehicle.defaultDestinationId)
        };
      }

      console.log(`✅ Found ${availableDestinations.length} available destinations for ${licensePlate}`);
      return result;

    } catch (error) {
      console.error('❌ Error getting vehicle destinations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle a fully booked vehicle by generating exit ticket and removing from queue
   */
  private async handleFullyBookedVehicle(queueEntry: any): Promise<void> {
    try {
      console.log(`🎫 [BACKEND DEBUG] Generating exit ticket for fully booked vehicle ${queueEntry.vehicle.licensePlate}`);
      console.log(`🎫 [BACKEND DEBUG] Queue entry details:`, {
        id: queueEntry.id,
        licensePlate: queueEntry.vehicle.licensePlate,
        destination: queueEntry.destinationName,
        totalSeats: queueEntry.totalSeats,
        availableSeats: queueEntry.availableSeats,
        status: queueEntry.status
      });
      
      // Generate exit ticket data
      const exitTicketData = {
        ticketNumber: `EXIT_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        licensePlate: queueEntry.vehicle.licensePlate,
        departureStationName: this.currentStationId, // Current station
        destinationStationName: queueEntry.destinationName,
        exitTime: new Date(),
        totalSeats: queueEntry.totalSeats,
        occupiedSeats: queueEntry.totalSeats - queueEntry.availableSeats
      };

      console.log(`🎫 [BACKEND DEBUG] Generated exit ticket data:`, exitTicketData);

      // Broadcast exit ticket event to frontend for printing
      console.log(`🎫 [BACKEND DEBUG] Exit ticket generated for vehicle: ${queueEntry.vehicle.licensePlate}`);

      // Immediately remove vehicle from queue by directly deleting the queue entry
      console.log(`🚪 Removing fully booked vehicle ${queueEntry.vehicle.licensePlate} from queue`);
      
      try {
        // Directly delete the queue entry since the vehicle is fully booked
        await prisma.vehicleQueue.delete({
          where: { id: queueEntry.id }
        });

        // Reorder remaining vehicles in the same destination queue
        await this.reorderQueue(queueEntry.destinationId);

        console.log(`✅ Successfully removed fully booked vehicle ${queueEntry.vehicle.licensePlate} from queue`);
        
        // Invalidate Redis cache for this destination queue
        const redis = getRedisService();
        if (redis.getConnectionStatus()) {
          try {
            // Clear cached queue entries for this destination
            await redis.del(`${REDIS_KEYS.QUEUE}:${queueEntry.destinationId}`);
            console.log(`🗑️ Cleared Redis cache for fully booked vehicle destination: ${queueEntry.destinationId}`);
          } catch (cacheError) {
            console.error('❌ Error clearing Redis cache:', cacheError);
          }
        }
        
        // Broadcast vehicle departure notification

        // Broadcast queue update to refresh all clients
        this.broadcastQueueUpdate(queueEntry.destinationId);

      } catch (deleteError) {
        console.error(`❌ Failed to remove fully booked vehicle ${queueEntry.vehicle.licensePlate} from queue:`, deleteError);
      }

    } catch (error) {
      console.error('❌ Error handling fully booked vehicle:', error);
    }
  }
  /**
   * Get available seats for a specific destination
   */
  async getAvailableSeatsForDestination(destinationId: string): Promise<number> {
    try {
      const queueEntries = await prisma.vehicleQueue.findMany({
        where: {
          destinationId,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        }
      });

      const totalAvailableSeats = queueEntries.reduce((sum, entry) => sum + entry.availableSeats, 0);
      return totalAvailableSeats;
    } catch (error) {
      console.error('❌ Error getting available seats for destination:', error);
      return 0;
    }
  }

  /**
   * Get all destinations with their current availability
   */
  async getDestinationsWithAvailability(): Promise<any[]> {
    try {
      // Get all routes
      const routes = await prisma.route.findMany({
        where: { isActive: true },
        select: {
          stationId: true,
          stationName: true,
          governorate: true,
          governorateAr: true,
          delegation: true,
          delegationAr: true
        }
      });

      // Get availability for each destination
      const destinationsWithAvailability = await Promise.all(
        routes.map(async (route) => {
          const availableSeats = await this.getAvailableSeatsForDestination(route.stationId);
          const vehicleCount = await prisma.vehicleQueue.count({
            where: {
              destinationId: route.stationId,
              status: { in: ['WAITING', 'LOADING', 'READY'] }
            }
          });

          return {
            destinationId: route.stationId,
            destinationName: route.stationName,
            totalAvailableSeats: availableSeats,
            vehicleCount,
            governorate: route.governorate,
            governorateAr: route.governorateAr,
            delegation: route.delegation,
            delegationAr: route.delegationAr
          };
        })
      );

      return destinationsWithAvailability.filter(dest => dest.totalAvailableSeats > 0);
    } catch (error) {
      console.error('❌ Error getting destinations with availability:', error);
      return [];
    }
  }
}

// Export a function to create queue service instance
export const createQueueService = () => {
  return new QueueService();
}; 