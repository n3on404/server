import { prisma } from '../config/database';
import * as dashboardController from '../controllers/dashboardController';
import { env } from '../config/environment';
import { configService } from '../config/supervisorConfig';
import { getRedisService } from './redisService';
import { getMQTTService } from './mqttService';
import { REDIS_KEYS } from '../config/redisConfig';

/**
 * Queue Booking Service
 * 
 * Handles bookings for REGULAR queue vehicles only.
 * Overnight queue vehicles are excluded from booking operations.
 * 
 * This ensures that:
 * - Staff can only book seats on vehicles in the regular daily queue
 * - Overnight queue vehicles remain separate for next-day operations
 * - Booking flow is simplified for current day operations
 */

export interface BookingRequest {
  destinationId: string;
  seatsRequested: number;
  bookingType?: 'CASH'; // Default to CASH
  staffId: string;
  paymentMethod?: 'CASH' ;
}

export interface BatchBookingRequest {
  bookings: Array<{
    destinationId: string;
    seatsRequested: number;
  }>;
  staffId: string;
  bookingType?: 'CASH';
  paymentMethod?: 'CASH';
}

export interface BookingResult {
  success: boolean;
  bookings?: QueueBooking[];
  error?: string;
  totalAmount?: number;
  verificationCodes?: string[];
  ticketIds?: string[]; // For cash bookings, these are the verification codes
  vehicleFullyBooked?: boolean;
  exitPasses?: ExitPassSummary[] | null;
}

export interface ExitPassSummary {
  currentExitPass: any;
}

export interface QueueBooking {
  id: string;
  queueId: string | null;
  vehicleLicensePlate: string;
  destinationName: string;
  startStationName: string; // Add current station name
  seatsBooked: number;
  baseAmount: number; // Base price from route
  serviceFeeAmount: number; // Service fee amount
  totalAmount: number; // Total amount (base + service fee)
  verificationCode: string;
  bookingType: 'CASH' | 'ONLINE';
  createdAt: Date;
  queuePosition: number;
  estimatedDeparture?: Date | null;
}

export interface AvailableSeats {
  destinationId: string;
  destinationName: string;
  totalAvailableSeats: number;
  vehicles: VehicleSeatingInfo[];
}

export interface VehicleSeatingInfo {
  queueId: string;
  vehicleId: string;
  licensePlate: string;
  queuePosition: number;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  status: string;
  estimatedDeparture?: Date | null;
}


export class QueueBookingService {
  private currentStationId: string;
  private redisService: ReturnType<typeof getRedisService>;

  constructor() {
    this.currentStationId = configService.getStationId();
    this.redisService = getRedisService();
  }

  /**
   * Create multiple bookings in a single optimized transaction
   */
  async createBatchBookings(batchRequest: BatchBookingRequest): Promise<BookingResult> {
    try {
      console.log(`🎫 Creating batch bookings for ${batchRequest.bookings.length} destinations`);

      const result = await prisma.$transaction(async (tx) => {
        const allBookings: QueueBooking[] = [];
        const allVerificationCodes: string[] = [];
        let totalAmount = 0;
        const errors: string[] = [];

        // Process each booking request
        for (const bookingReq of batchRequest.bookings) {
          try {
            // Get available seats for this destination
            const queueEntries = await tx.vehicleQueue.findMany({
              where: {
                destinationId: bookingReq.destinationId,
                queueType: 'REGULAR',
                status: { in: ['WAITING', 'LOADING', 'READY'] }
              },
              include: {
                vehicle: true
              },
              orderBy: [
                { queuePosition: 'asc' }
              ]
            });

            if (queueEntries.length === 0) {
              errors.push(`No vehicles available for destination ${bookingReq.destinationId}`);
              continue;
            }

            // Calculate total available seats
            const totalAvailableSeats = queueEntries.reduce((sum, entry) => sum + entry.availableSeats, 0);
            if (totalAvailableSeats < bookingReq.seatsRequested) {
              errors.push(`Not enough seats for ${bookingReq.destinationId}. Requested: ${bookingReq.seatsRequested}, Available: ${totalAvailableSeats}`);
              continue;
            }

            // Get route and station config
            const [route, stationConfig] = await Promise.all([
              tx.route.findUnique({
                where: { stationId: bookingReq.destinationId },
                select: { basePrice: true }
              }),
              tx.stationConfig.findFirst({
                select: { serviceFee: true }
              })
            ]);

            const basePrice = route?.basePrice || 0;
            const serviceFee = Number(stationConfig?.serviceFee || 0.200);

            // Prepare vehicles data
            const vehicles: VehicleSeatingInfo[] = queueEntries.map(entry => ({
              queueId: entry.id,
              vehicleId: entry.vehicleId,
              licensePlate: entry.vehicle.licensePlate,
              queuePosition: entry.queuePosition,
              availableSeats: entry.availableSeats,
              totalSeats: entry.totalSeats,
              basePrice: basePrice || entry.basePrice,
              status: entry.status,
              estimatedDeparture: entry.estimatedDeparture
            }));

            // Allocate seats
            const allocation = this.allocateSeats(vehicles, bookingReq.seatsRequested);
            if (allocation.length === 0) {
              errors.push(`Unable to allocate seats for ${bookingReq.destinationId}`);
              continue;
            }

            // Create bookings for this destination
            const bookingData = [];
            const queueUpdates = [];

            for (const { vehicle, seatsToBook } of allocation) {
              const verificationCode = this.generateVerificationCode();
              const baseAmount = seatsToBook * vehicle.basePrice;
              const serviceFeeAmount = seatsToBook * serviceFee;
              const bookingAmount = baseAmount + serviceFeeAmount;

              bookingData.push({
                queueId: vehicle.queueId,
                seatsBooked: seatsToBook,
                totalAmount: bookingAmount,
                bookingSource: 'CASH_STATION',
                bookingType: 'CASH',
                paymentStatus: 'PAID',
                paymentMethod: 'CASH',
                verificationCode,
                createdBy: batchRequest.staffId
              });

              queueUpdates.push({
                where: { 
                  id: vehicle.queueId,
                  availableSeats: { gte: seatsToBook }
                },
                data: {
                  availableSeats: { decrement: seatsToBook }
                }
              });

              allVerificationCodes.push(verificationCode);
              totalAmount += bookingAmount;
            }

            // Batch create bookings
            await tx.booking.createMany({
              data: bookingData
            });

            // Batch update queue entries
            for (const updateData of queueUpdates) {
              const updatedQueue = await tx.vehicleQueue.updateMany(updateData);
              if (updatedQueue.count === 0) {
                throw new Error(`Booking conflict for destination ${bookingReq.destinationId}`);
              }
            }
          } catch (error) {
            errors.push(`Error processing ${bookingReq.destinationId}: ${(error as Error).message}`);
          }
        }

        if (errors.length > 0 && allBookings.length === 0) {
          throw new Error(`Batch booking failed: ${errors.join(', ')}`);
        }

        // Get created bookings
        const createdBookings = await tx.booking.findMany({
          where: {
            verificationCode: { in: allVerificationCodes }
          },
          include: {
            queue: {
              include: {
                vehicle: true
              }
            }
          }
        });

        // Format bookings
        const formattedBookings: QueueBooking[] = createdBookings.map(booking => ({
          id: booking.id,
          queueId: booking.queueId,
          vehicleLicensePlate: booking.queue?.vehicle?.licensePlate || '—',
          destinationName: booking.queue?.destinationName || '—',
          startStationName: configService.getStationName(),
          seatsBooked: booking.seatsBooked,
          baseAmount: booking.totalAmount - (booking.seatsBooked * 0.200),
          serviceFeeAmount: booking.seatsBooked * 0.200,
          totalAmount: booking.totalAmount,
          verificationCode: booking.verificationCode,
          bookingType: 'CASH' as 'CASH' | 'ONLINE',
          createdAt: booking.createdAt,
          queuePosition: booking.queue?.queuePosition ?? 0,
          estimatedDeparture: booking.queue?.estimatedDeparture || null
        }));

        return {
          success: true,
          bookings: formattedBookings,
          totalAmount,
          verificationCodes: allVerificationCodes,
          ticketIds: allVerificationCodes,
        };
      });

      console.log(`✅ Batch created ${result.bookings?.length || 0} bookings`);
      return result;

    } catch (error) {
      console.error('❌ Error in createBatchBookings:', error);
      return {
        success: false,
        error: (error as Error).message || 'Failed to create batch bookings'
      };
    }
  }

  /**
   * Get available seats for a destination
   */
  async getAvailableSeats(destinationId: string): Promise<{
    success: boolean;
    data?: AvailableSeats;
    error?: string;
  }> {
    try {
      console.log(`📊 Getting available seats for destination: ${destinationId} (REGULAR queue only)`);

      // Try to get cached queue entries first
      const cachedEntries = await this.redisService.getCachedQueueEntries(destinationId);
      let queueEntries;
      
      if (cachedEntries) {
        console.log(`📊 Using cached queue entries for ${destinationId}`);
        queueEntries = cachedEntries;
      } else {
        // Get only REGULAR queue vehicles for booking (exclude overnight queue)
        queueEntries = await prisma.vehicleQueue.findMany({
          where: {
            destinationId,
            queueType: 'REGULAR', // Only regular queue for booking
            status: { in: ['WAITING', 'LOADING', 'READY'] }
          },
          include: {
            vehicle: true
          },
          orderBy: [
            { queuePosition: 'asc' }
          ]
        });

        // Cache the results
        await this.redisService.cacheQueueEntries(destinationId, queueEntries);
      }

      if (queueEntries.length === 0) {
        return {
          success: false,
          error: `No regular queue vehicles available for destination ${destinationId}`
        };
      }

      // Get the base price from route table for this destination (with caching)
      let basePrice = 0;
      try {
        const cachedRoute = await this.redisService.getCachedRoute(destinationId);
        let route;
        
        if (cachedRoute) {
          route = cachedRoute;
        } else {
          route = await prisma.route.findUnique({
            where: { stationId: destinationId }
          });
          if (route) {
            await this.redisService.cacheRoute(destinationId, route);
          }
        }
        
        if (route && route.basePrice > 0) {
          basePrice = route.basePrice;
          console.log(`✅ Found base price for destination ${destinationId}: ${basePrice} TND`);
        } else {
          console.warn(`⚠️ No route found for destination ${destinationId}, using default price`);
        }
      } catch (error) {
        console.error(`❌ Error fetching route price for ${destinationId}:`, error);
      }

      const vehicles: VehicleSeatingInfo[] = [];
      let totalAvailableSeats = 0;

      for (const entry of queueEntries) {
        const vehicleInfo: VehicleSeatingInfo = {
          queueId: entry.id,
          vehicleId: entry.vehicleId,
          licensePlate: entry.vehicle.licensePlate,
          queuePosition: entry.queuePosition,
          availableSeats: entry.availableSeats,
          totalSeats: entry.totalSeats,
          basePrice: basePrice || entry.basePrice,
          status: entry.status,
          estimatedDeparture: entry.estimatedDeparture
        };

        vehicles.push(vehicleInfo);
        totalAvailableSeats += entry.availableSeats;
      }

      return {
        success: true,
        data: {
          destinationId,
          destinationName: queueEntries[0].destinationName,
          totalAvailableSeats,
          vehicles
        }
      };

    } catch (error) {
      console.error('❌ Error getting available seats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create booking with intelligent seat allocation and race condition protection
   */
  async createBooking(bookingRequest: BookingRequest): Promise<BookingResult> {
    try {
      console.log(`🎫 Creating booking for ${bookingRequest.seatsRequested} seats to ${bookingRequest.destinationId} (REGULAR queue only)`);

      // Use a database transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        // Optimized: Get all required data in parallel queries
        const [queueEntries, route, stationConfig] = await Promise.all([
          // Get available seats within the transaction for consistency (REGULAR queue only)
          tx.vehicleQueue.findMany({
            where: {
              destinationId: bookingRequest.destinationId,
              queueType: 'REGULAR', // Only regular queue for booking
              status: { in: ['WAITING', 'LOADING', 'READY'] }
            },
            include: {
              vehicle: true
            },
            orderBy: [
              { queuePosition: 'asc' }
            ]
          }),
          // Get base price for this destination
          tx.route.findUnique({
            where: { stationId: bookingRequest.destinationId },
            select: { basePrice: true }
          }),
          // Get station config for service fee
          tx.stationConfig.findFirst({
            select: { serviceFee: true }
          })
        ]);

        if (queueEntries.length === 0) {
          throw new Error('No regular queue vehicles available for this destination');
        }

        // Calculate total available seats within transaction
        const totalAvailableSeats = queueEntries.reduce((sum, entry) => sum + entry.availableSeats, 0);

        // Check if we have enough seats (atomic check)
        if (totalAvailableSeats < bookingRequest.seatsRequested) {
          throw new Error(`Not enough seats available. Requested: ${bookingRequest.seatsRequested}, Available: ${totalAvailableSeats}`);
        }

        // Get base price for this destination
        const basePrice = route?.basePrice || 0;
        const serviceFee = Number(stationConfig?.serviceFee || 0.200);

        // Prepare vehicles data for allocation
        const vehicles: VehicleSeatingInfo[] = queueEntries.map(entry => ({
          queueId: entry.id,
          vehicleId: entry.vehicleId,
          licensePlate: entry.vehicle.licensePlate,
          queuePosition: entry.queuePosition,
          availableSeats: entry.availableSeats,
          totalSeats: entry.totalSeats,
          basePrice: basePrice || entry.basePrice,
          status: entry.status,
          estimatedDeparture: entry.estimatedDeparture
        }));

        // Allocate seats across vehicles
        const allocation = this.allocateSeats(vehicles, bookingRequest.seatsRequested);
        
        if (allocation.length === 0) {
          throw new Error('Unable to allocate seats across available vehicles');
        }

        // Optimized: Prepare all booking data upfront to avoid N+1 queries
        const bookings: QueueBooking[] = [];
        const verificationCodes: string[] = [];
        const bookingData = [];
        const queueUpdates = [];
        let totalAmount = 0;
        
        for (const { vehicle, seatsToBook } of allocation) {
          const verificationCode = this.generateVerificationCode();
          
          // Calculate base amount and total amount with service fee
          const baseAmount = seatsToBook * vehicle.basePrice;
          const serviceFeeAmount = seatsToBook * serviceFee;
          const bookingAmount = baseAmount + serviceFeeAmount;

          // Prepare booking data
          const bookingType = bookingRequest.bookingType || 'CASH';
          bookingData.push({
            queueId: vehicle.queueId,
            seatsBooked: seatsToBook,
            totalAmount: bookingAmount,
            bookingSource: bookingType === 'CASH' ? 'CASH_STATION' : 'ONLINE',
            bookingType: bookingType,
            paymentStatus: bookingType === 'CASH' ? 'PAID' : 'PENDING',
            paymentMethod: bookingRequest.paymentMethod || (bookingType === 'CASH' ? 'CASH' : 'ONLINE'),
            verificationCode,
            createdBy: bookingRequest.staffId
          });

          // Prepare queue update data
          queueUpdates.push({
            where: { 
              id: vehicle.queueId,
              availableSeats: { gte: seatsToBook } // Ensure we still have enough seats
            },
            data: {
              availableSeats: { decrement: seatsToBook }
            }
          });

          verificationCodes.push(verificationCode);
          totalAmount += bookingAmount;
        }

        // Optimized: Batch create all bookings
        const createdBookings = await tx.booking.createMany({
          data: bookingData
        });

        // Optimized: Batch update all queue entries
        for (const updateData of queueUpdates) {
          const updatedQueue = await tx.vehicleQueue.updateMany(updateData);
          
          // Check if the update actually happened (no rows updated means conflict)
          if (updatedQueue.count === 0) {
            throw new Error(`Booking conflict: Seats were just booked by another user. Please try again.`);
          }
        }

        // Get the created bookings with full data for response
        const bookingIds = await tx.booking.findMany({
          where: {
            verificationCode: { in: verificationCodes }
          },
          include: {
            queue: {
              include: {
                vehicle: true
              }
            }
          }
        });

        // Convert to QueueBooking format for response
        const formattedBookings: QueueBooking[] = bookingIds.map(booking => ({
          id: booking.id,
          queueId: booking.queueId,
          vehicleLicensePlate: booking.queue?.vehicle?.licensePlate || '—',
          destinationName: booking.queue?.destinationName || '—',
          startStationName: configService.getStationName(),
          seatsBooked: booking.seatsBooked,
          baseAmount: booking.totalAmount - (booking.seatsBooked * serviceFee),
          serviceFeeAmount: booking.seatsBooked * serviceFee,
          totalAmount: booking.totalAmount,
          verificationCode: booking.verificationCode,
          bookingType: (booking.bookingType || 'CASH') as 'CASH' | 'ONLINE',
          createdAt: booking.createdAt,
          queuePosition: booking.queue?.queuePosition ?? 0,
          estimatedDeparture: booking.queue?.estimatedDeparture || null
        }));

        console.log(`✅ Batch created ${bookingIds.length} bookings for ${bookingRequest.seatsRequested} seats`);

        return {
          success: true,
          bookings: formattedBookings,
          totalAmount,
          verificationCodes,
          ticketIds: verificationCodes,
        };
      });

      // Update vehicle statuses based on new bookings (outside transaction to avoid conflicts)
      for (const booking of result.bookings) {
        try {
          const { createQueueService } = await import('./queueService');
          const queueService = createQueueService();
          if (booking.queueId) {
            await queueService.updateVehicleStatusBasedOnBookings(booking.queueId, bookingRequest.staffId);
          }
        } catch (error) {
          console.error('❌ Error updating vehicle status after booking:', error);
        }
      }

      // Create trip records for fully booked vehicles (outside transaction to avoid conflicts)
      for (const booking of result.bookings) {
        const queueInfo = booking.queueId
          ? await prisma.vehicleQueue.findUnique({
              where: { id: booking.queueId },
              include: { vehicle: true }
            })
          : null;
        
        if (queueInfo && queueInfo.status === 'READY' && queueInfo.availableSeats === 0) {
          if (booking.queueId) {
            await this.createTripRecord(booking.queueId, queueInfo);
          }
        }
      }

      // Broadcast booking update AFTER successful transaction
      this.broadcastBookingUpdate(bookingRequest.destinationId, result);

      // MQTT: publish seat availability and booking-created events
      try {
        const mqtt = getMQTTService();
        const destinationId = bookingRequest.destinationId;
        // Compute latest availability for destination
        const queues = await prisma.vehicleQueue.findMany({
          where: { destinationId },
          select: { destinationName: true, availableSeats: true }
        });
        const destinationName = queues[0]?.destinationName || result.bookings[0]?.destinationName || destinationId;
        const availableSeats = queues.reduce((acc, q) => acc + (q.availableSeats || 0), 0);
        const justBooked = result.bookings.reduce((acc, b) => acc + (b.seatsBooked || 0), 0);
        const totalSeats = availableSeats + justBooked;
        await mqtt.publishSeatAvailability(destinationId, {
          destinationId,
          destinationName,
          availableSeats,
          totalSeats,
          timestamp: new Date().toISOString()
        });
        for (const b of result.bookings) {
          await mqtt.publishBookingEvent(b.id, 'created', {
            destinationId,
            destinationName: b.destinationName,
            seatsBooked: b.seatsBooked,
            totalAmount: b.totalAmount,
            verificationCode: b.verificationCode
          });
        }
      } catch (e) {
        console.warn('⚠️ MQTT publish after booking failed:', e);
      }

      // After booking, update statuses and collect any exit passes generated by READY vehicles
      const exitPassesCollected: any[] = [];
      for (const booking of result.bookings) {
        try {
          const { createQueueService } = await import('./queueService');
          const queueService = createQueueService();
        const upd = booking.queueId ? await queueService.updateVehicleStatusBasedOnBookings(booking.queueId, bookingRequest.staffId) : null;
          if (upd && (upd as any).exitPass) {
            exitPassesCollected.push((upd as any).exitPass);
          }
        } catch (err) {
          console.error('❌ Error updating status/collecting exit pass after booking:', err);
        }
      }

      console.log(`🎉 Booking completed: ${bookingRequest.seatsRequested} seats across ${result.bookings.length} vehicle(s), Total: $${result.totalAmount}`);

      return {
        ...result,
        vehicleFullyBooked: exitPassesCollected.length > 0,
        exitPasses: exitPassesCollected.length > 0 ? exitPassesCollected : null
      };

    } catch (error) {
      console.error('❌ Error creating booking:', error);
      
      // Determine conflict type and broadcast appropriate notification
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during booking';
      
      if (errorMessage.includes('Booking conflict') || errorMessage.includes('were just booked by another user')) {
        this.broadcastBookingConflict(bookingRequest.destinationId, errorMessage, 'booking_conflict');
      } else if (errorMessage.includes('Not enough seats available') || errorMessage.includes('Insufficient seats')) {
        this.broadcastBookingConflict(bookingRequest.destinationId, errorMessage, 'insufficient_seats');
      } else if (errorMessage.includes('no longer exists') || errorMessage.includes('Seats on vehicle')) {
        this.broadcastBookingConflict(bookingRequest.destinationId, errorMessage, 'seat_taken');
      }
      
      // Broadcast immediate update to refresh all clients on failure
      this.broadcastBookingUpdate(bookingRequest.destinationId);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Intelligent seat allocation across vehicles
   */
  private allocateSeats(vehicles: VehicleSeatingInfo[], seatsRequested: number): Array<{
    vehicle: VehicleSeatingInfo;
    seatsToBook: number;
  }> {
    const allocation: Array<{ vehicle: VehicleSeatingInfo; seatsToBook: number }> = [];
    let remainingSeats = seatsRequested;

    // Sort vehicles by queue position to prioritize earlier vehicles
    const sortedVehicles = [...vehicles].sort((a, b) => {
      return a.queuePosition - b.queuePosition;
    });

    for (const vehicle of sortedVehicles) {
      if (remainingSeats <= 0) break;
      if (vehicle.availableSeats <= 0) continue;

      const seatsToBook = Math.min(remainingSeats, vehicle.availableSeats);
      
      allocation.push({
        vehicle,
        seatsToBook
      });

      remainingSeats -= seatsToBook;

      console.log(`📋 Allocated ${seatsToBook} seats to vehicle ${vehicle.licensePlate} (position ${vehicle.queuePosition})`);
    }

    if (remainingSeats > 0) {
      console.warn(`⚠️ Unable to allocate ${remainingSeats} seats`);
      return []; // Return empty if we can't fulfill the complete request
    }

    return allocation;
  }

  /**
   * Get booking by verification code
   */
  async getBookingByVerificationCode(verificationCode: string): Promise<{
    success: boolean;
    booking?: QueueBooking;
    error?: string;
  }> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { verificationCode },
        include: {
          queue: {
            include: {
              vehicle: true
            }
          }
        }
      });

      if (!booking) {
        return {
          success: false,
          error: 'Booking not found'
        };
      }

      // Calculate breakdown from existing data
      const pricePerSeat = booking.queue?.basePrice ?? 0;
      const baseAmount = booking.seatsBooked * pricePerSeat;
      const serviceFeeAmount = booking.totalAmount - baseAmount; // Calculate service fee as difference
      
      const queueBooking: QueueBooking = {
        id: booking.id,
        queueId: booking.queueId,
        vehicleLicensePlate: booking.queue?.vehicle?.licensePlate || '—',
        destinationName: booking.queue?.destinationName || '—',
        startStationName: configService.getStationName(),
        seatsBooked: booking.seatsBooked,
        baseAmount: baseAmount,
        serviceFeeAmount: serviceFeeAmount,
        totalAmount: booking.totalAmount,
        verificationCode: booking.verificationCode,
        bookingType: (booking.bookingType || 'CASH') as 'CASH' | 'ONLINE',
        createdAt: booking.createdAt,
        queuePosition: booking.queue?.queuePosition ?? 0,
        estimatedDeparture: booking.queue?.estimatedDeparture || null
      };

      return {
        success: true,
        booking: queueBooking
      };

    } catch (error) {
      console.error('❌ Error getting booking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify and mark ticket as used
   */
  async verifyTicket(verificationCode: string, staffId: string): Promise<{
    success: boolean;
    booking?: QueueBooking;
    error?: string;
  }> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { verificationCode },
        include: {
          queue: {
            include: {
              vehicle: true
            }
          }
        }
      });

      if (!booking) {
        return {
          success: false,
          error: 'Invalid verification code'
        };
      }

      if (booking.isVerified) {
        return {
          success: false,
          error: 'Ticket already verified'
        };
      }

      // Mark as verified
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
          verifiedById: staffId
        },
        include: {
          queue: {
            include: {
              vehicle: true
            }
          }
        }
      });

      // Calculate breakdown from existing data
      const pricePerSeat = updatedBooking.queue?.basePrice ?? 0;
      const baseAmount = updatedBooking.seatsBooked * pricePerSeat;
      const serviceFeeAmount = updatedBooking.totalAmount - baseAmount; // Calculate service fee as difference
      
      const queueBooking: QueueBooking = {
        id: updatedBooking.id,
        queueId: updatedBooking.queueId,
        vehicleLicensePlate: updatedBooking.queue?.vehicle?.licensePlate || '—',
        destinationName: updatedBooking.queue?.destinationName || '—',
        startStationName: configService.getStationName(),
        seatsBooked: updatedBooking.seatsBooked,
        baseAmount: baseAmount,
        serviceFeeAmount: serviceFeeAmount,
        totalAmount: updatedBooking.totalAmount,
        verificationCode: updatedBooking.verificationCode,
        bookingType: (updatedBooking.bookingType || 'CASH') as 'CASH' | 'ONLINE',
        createdAt: updatedBooking.createdAt,
        queuePosition: updatedBooking.queue?.queuePosition ?? 0,
        estimatedDeparture: updatedBooking.queue?.estimatedDeparture || null
      };

      return {
        success: true,
        booking: queueBooking
      };

    } catch (error) {
      console.error('❌ Error verifying ticket:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all destinations with available seats (filters out fully booked destinations)
   */
  async getAvailableDestinations(filters?: {
    governorate?: string;
    delegation?: string;
  }): Promise<{
    success: boolean;
    destinations?: Array<{
      destinationId: string;
      destinationName: string;
      totalAvailableSeats: number;
      vehicleCount: number;
      governorate?: string | undefined;
      governorateAr?: string | undefined;
      delegation?: string | undefined;
      delegationAr?: string | undefined;
    }>;
    error?: string;
  }> {
    try {
      console.log('📊 Getting available destinations for booking (REGULAR queue only, filtering fully booked)...');
      
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

      // Get available seats for each destination from regular queue only
      const destinationsWithSeats = await Promise.all(
        allRoutes.map(async (route) => {
          const queueEntries = await prisma.vehicleQueue.findMany({
            where: {
              destinationId: route.stationId,
              queueType: 'REGULAR', // Only regular queue for booking
              status: { in: ['WAITING', 'LOADING'] }
            },
            select: {
              availableSeats: true,
              id: true
            }
          });

          const totalAvailableSeats = queueEntries.reduce((sum, entry) => sum + entry.availableSeats, 0);
          const vehicleCount = queueEntries.length;

          return {
            destinationId: route.stationId,
            destinationName: route.stationName,
            totalAvailableSeats,
            vehicleCount,
            governorate: route.governorate || undefined,
            governorateAr: route.governorateAr || undefined,
            delegation: route.delegation || undefined,
            delegationAr: route.delegationAr || undefined
          };
        })
      );

      // Filter out destinations with no available seats
      const destinationsWithRoutes = destinationsWithSeats.filter(dest => 
        dest.totalAvailableSeats > 0
      );

      // Remove duplicates based on destinationId (in case there are multiple routes with same station)
      const uniqueDestinations = destinationsWithRoutes.reduce((acc, dest) => {
        const existing = acc.find(d => d.destinationId === dest.destinationId);
        if (!existing) {
          acc.push(dest);
        } else {
          // If duplicate found, merge the seat counts
          existing.totalAvailableSeats += dest.totalAvailableSeats;
          existing.vehicleCount += dest.vehicleCount;
        }
        return acc;
      }, [] as typeof destinationsWithRoutes);

      // Apply filters if provided
      let filteredDestinations = uniqueDestinations;
      
      if (filters?.governorate) {
        filteredDestinations = filteredDestinations.filter(dest => 
          dest.governorate === filters.governorate
        );
      }
      
      if (filters?.delegation) {
        filteredDestinations = filteredDestinations.filter(dest => 
          dest.delegation === filters.delegation
        );
      }

      const totalRoutes = allRoutes.length;
      const availableCount = destinationsWithRoutes.length;
      const uniqueCount = uniqueDestinations.length;
      const filteredOut = totalRoutes - availableCount;
      const duplicatesRemoved = availableCount - uniqueCount;
      
      console.log(`✅ Found ${filteredDestinations.length} destinations with available seats`);
      console.log(`📊 Total routes: ${totalRoutes}, Available: ${availableCount}, Unique: ${uniqueCount}, Duplicates removed: ${duplicatesRemoved}`);

      return {
        success: true,
        destinations: filteredDestinations
      };

    } catch (error) {
      console.error('❌ Error getting available destinations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cancel booking or remove specific number of seats
   */
  async cancelBooking(bookingId: string, seatsToCancel?: number, staffId?: string): Promise<{
    success: boolean;
    message: string;
    updatedBooking?: QueueBooking;
    cancelledCompletely?: boolean;
    seatsRestored?: number;
    error?: string;
  }> {
    try {
      console.log(`🚫 Cancelling booking: ${bookingId}, seats to cancel: ${seatsToCancel || 'all'}`);

      // Use a database transaction to ensure consistency
      const result = await prisma.$transaction(async (tx) => {
        // Get the booking with queue and vehicle info
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            queue: {
              include: {
                vehicle: true
              }
            }
          }
        });

        if (!booking) {
          throw new Error('Booking not found');
        }

        // Check if booking can be cancelled (only if not yet verified/used)
        if (booking.isVerified) {
          throw new Error('Cannot cancel a booking that has already been verified/used');
        }

        // Determine how many seats to cancel
        const totalSeatsBooked = booking.seatsBooked;
        const actualSeatsToCancel = seatsToCancel && seatsToCancel < totalSeatsBooked 
          ? seatsToCancel 
          : totalSeatsBooked;

        if (seatsToCancel && seatsToCancel > totalSeatsBooked) {
          throw new Error(`Cannot cancel ${seatsToCancel} seats. Booking only has ${totalSeatsBooked} seats.`);
        }

        const remainingSeats = totalSeatsBooked - actualSeatsToCancel;
        const isCancellingCompletely = remainingSeats === 0;

        // Calculate refund amount proportionally
        const refundAmount = (booking.totalAmount / totalSeatsBooked) * actualSeatsToCancel;

        let updatedBooking: any;

        if (isCancellingCompletely) {
          // Mark booking as cancelled completely
          updatedBooking = await tx.booking.update({
            where: { id: bookingId },
            data: {
              paymentStatus: 'CANCELLED',
              verificationCode: `CANCELLED_${booking.verificationCode}`,
              // Keep original data for audit trail
            },
            include: {
              queue: {
                include: {
                  vehicle: true
                }
              }
            }
          });
        } else {
          // Update booking with reduced seats and amount
          const newTotalAmount = booking.totalAmount - refundAmount;
          updatedBooking = await tx.booking.update({
            where: { id: bookingId },
            data: {
              seatsBooked: remainingSeats,
              totalAmount: newTotalAmount
            },
            include: {
              queue: {
                include: {
                  vehicle: true
                }
              }
            }
          });
        }

        // Restore seats to the vehicle queue
        const updatedQueue = booking.queueId
          ? await tx.vehicleQueue.update({
              where: { id: booking.queueId },
              data: {
                availableSeats: { increment: actualSeatsToCancel }
              }
            })
          : { availableSeats: 0 } as any;

        // If the vehicle was READY (fully booked) and now has available seats, change status back to LOADING
        if (booking.queue?.status === 'READY' && updatedQueue.availableSeats > 0) {
          if (booking.queueId) {
            await tx.vehicleQueue.update({
              where: { id: booking.queueId },
              data: { status: 'LOADING' }
            });
          }
          console.log(`🔄 Vehicle ${(booking.queue?.vehicle?.licensePlate)||'—'} status changed from READY to LOADING (seats available again)`);
        }

        return {
          updatedBooking,
          actualSeatsToCancel,
          refundAmount,
          isCancellingCompletely,
          vehicleLicensePlate: booking.queue?.vehicle?.licensePlate || '—',
          destinationId: booking.queue?.destinationId || '',
          destinationName: booking.queue?.destinationName || '—'
        };
      });

      // Update vehicle statuses based on new seat availability (outside transaction)
      try {
        const { createQueueService } = await import('./queueService');
        const queueService = createQueueService();
        await queueService.updateVehicleStatusBasedOnBookings(result.updatedBooking.queueId);
      } catch (error) {
        console.error('❌ Error updating vehicle status after cancellation:', error);
      }

      // Invalidate Redis cache for this destination queue
      const redis = getRedisService();
      if (redis.getConnectionStatus()) {
        try {
          // Clear cached queue entries for this destination
          await redis.del(`${REDIS_KEYS.QUEUE}:${result.destinationId}`);
          console.log(`🗑️ Cleared Redis cache for booking cancellation destination: ${result.destinationId}`);
        } catch (cacheError) {
          console.error('❌ Error clearing Redis cache:', cacheError);
        }
      }

      // Broadcast the cancellation update
      this.broadcastBookingUpdate(result.destinationId);

      // MQTT: publish booking-cancelled event and destinations update
      try {
        const mqtt = getMQTTService();
        // Publish booking cancelled event
        await mqtt.publishBookingEvent(bookingId, 'cancelled', {
          destinationId: result.destinationId,
          destinationName: result.destinationName,
          seatsCancelled: result.actualSeatsToCancel,
          refundAmount: result.refundAmount,
        });

        // Also publish destinations availability update so UIs refresh lists
        try {
          const { createQueueService } = await import('./queueService');
          const queueService = createQueueService();
          const destinations = await queueService.getDestinationsWithAvailability();
          await mqtt.publishDestinationsUpdate({
            destinations,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('⚠️ Could not publish destinations update after cancellation:', e);
        }
      } catch (e) {
        console.warn('⚠️ MQTT publish after booking cancellation failed:', e);
      }

      // Create the response booking object
      let queueBooking: QueueBooking | undefined;
      if (!result.isCancellingCompletely) {
        const pricePerSeat = result.updatedBooking.queue.basePrice;
        const baseAmount = result.updatedBooking.seatsBooked * pricePerSeat;
        const serviceFeeAmount = result.updatedBooking.totalAmount - baseAmount;

        queueBooking = {
          id: result.updatedBooking.id,
          queueId: result.updatedBooking.queueId,
          vehicleLicensePlate: result.updatedBooking.queue.vehicle.licensePlate,
          destinationName: result.updatedBooking.queue.destinationName,
          startStationName: configService.getStationName(),
          seatsBooked: result.updatedBooking.seatsBooked,
          baseAmount: baseAmount,
          serviceFeeAmount: serviceFeeAmount,
          totalAmount: result.updatedBooking.totalAmount,
          verificationCode: result.updatedBooking.verificationCode,
          bookingType: (result.updatedBooking.bookingType || 'CASH') as 'CASH' | 'ONLINE',
          createdAt: result.updatedBooking.createdAt,
          queuePosition: result.updatedBooking.queue.queuePosition,
          estimatedDeparture: result.updatedBooking.queue.estimatedDeparture
        };
      }

      const message = result.isCancellingCompletely 
        ? `Booking cancelled completely. ${result.actualSeatsToCancel} seats restored to vehicle ${result.vehicleLicensePlate}. Refund: ${result.refundAmount.toFixed(3)} TND`
        : `${result.actualSeatsToCancel} seats cancelled from booking. ${result.actualSeatsToCancel} seats restored to vehicle ${result.vehicleLicensePlate}. Refund: ${result.refundAmount.toFixed(3)} TND`;

      console.log(`✅ ${message}`);

      return {
        success: true,
        message,
        ...(queueBooking && { updatedBooking: queueBooking }),
        cancelledCompletely: result.isCancellingCompletely,
        seatsRestored: result.actualSeatsToCancel
      };

    } catch (error) {
      console.error('❌ Error cancelling booking:', error);
      return {
        success: false,
        message: 'Failed to cancel booking',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get available governments and delegations for filtering
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
      console.log('📍 Getting available locations for filtering...');
      
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

      routes.forEach(route => {
        if (!route.governorate || !route.delegation) return;

        if (!governmentMap.has(route.governorate)) {
          governmentMap.set(route.governorate, {
            name: route.governorate,
            nameAr: route.governorateAr ? route.governorateAr : undefined,
            delegations: new Map()
          });
        }

        const government = governmentMap.get(route.governorate)!;
        if (!government.delegations.has(route.delegation)) {
          government.delegations.set(route.delegation, {
            name: route.delegation,
            nameAr: route.delegationAr ? route.delegationAr : undefined
          });
        }
      });

      // Convert to array format
      const governments = Array.from(governmentMap.values()).map(gov => ({
        name: gov.name,
        nameAr: gov.nameAr ? gov.nameAr : undefined,
        delegations: Array.from(gov.delegations.values())
      }));

      console.log(`✅ Found ${governments.length} governments with locations`);

      return {
        success: true,
        governments
      };

    } catch (error) {
      console.error('❌ Error getting available locations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


  /**
   * Generate verification code
   */
  private generateVerificationCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Generate QR code string
   */
  private generateQRCode(verificationCode: string): string {
    return `LOUAJ_TICKET_${verificationCode}_${Date.now()}`;
  }

  /**
   * Broadcast booking update with enhanced conflict and success notifications
   */
  private async broadcastBookingUpdate(destinationId: string, result?: BookingResult): Promise<void> {
    try {
      const redis = getRedisService();
      
      if (redis.getConnectionStatus()) {
        // Publish booking update to Redis
        await redis.publish(`${REDIS_KEYS.LIVE_BOOKINGS}${destinationId}`, {
          type: 'booking_update',
          destinationId,
          result,
          timestamp: new Date().toISOString()
        });
        
        // Update booking statistics
        await redis.incrementDailyStats('bookings_created');
        if (result?.totalAmount) {
          await redis.incrementDailyStats('revenue', result.totalAmount);
        }
        
        console.log(`✅ Booking update published to Redis for destination: ${destinationId}`);
      }

      console.log(`📡 Broadcast queue update for destination: ${destinationId}`);

    } catch (error) {
      console.error('❌ Error broadcasting booking update:', error);
    }
  }

  /**
   * Broadcast booking conflict notification (websocket functionality removed)
   */
  private broadcastBookingConflict(destinationId: string, errorMessage: string, conflictType: 'insufficient_seats' | 'booking_conflict' | 'seat_taken' = 'booking_conflict'): void {
    // WebSocket functionality removed - notifications handled via API polling
    console.log(`Booking conflict: ${destinationId} - ${conflictType} - ${errorMessage}`);
  }

  /**
   * Emit financial updates for real-time supervisor dashboard
   */
  private async emitFinancialUpdate(): Promise<void> {
    try {
      // Get updated financial stats
      // const financialStats = await dashboardController.getFinancialStats();
      // const recentTransactions = await dashboardController.getTransactionHistory(10);
      
      console.log('📊 Financial update triggered from queue booking');
    } catch (error) {
      console.error('❌ Error sending financial update:', error);
    }
  }

  /**
   * Create trip record when vehicle is ready to start
   */
  private async createTripRecord(queueId: string, queueInfo: any): Promise<void> {
    try {
      console.log(`🚛 Creating trip record for vehicle ${queueInfo.vehicle.licensePlate}`);
      
      // Count total booked seats for this queue
      const bookedSeatsCount = await prisma.booking.aggregate({
        where: { 
          queueId: queueId,
          paymentStatus: { in: ['PAID', 'PENDING'] } // Include both paid and pending bookings
        },
        _sum: {
          seatsBooked: true
        }
      });

      const totalSeatsBooked = bookedSeatsCount._sum.seatsBooked || 0;

      const trip = await prisma.trip.create({
        data: {
          vehicleId: queueInfo.vehicleId,
          licensePlate: queueInfo.vehicle.licensePlate,
          destinationId: queueInfo.destinationId,
          destinationName: queueInfo.destinationName,
          queueId: queueId,
          seatsBooked: totalSeatsBooked,
          startTime: new Date()
        }
      });

      console.log(`✅ Trip record created: ${trip.id} for vehicle ${queueInfo.vehicle.licensePlate} to ${queueInfo.destinationName}`);
      console.log(`🎫 Total seats booked: ${totalSeatsBooked}`);

      // Trip record created successfully

    } catch (error) {
      console.error('❌ Error creating trip record:', error);
    }
  }

}

export const createQueueBookingService = () => {
  return new QueueBookingService();
};