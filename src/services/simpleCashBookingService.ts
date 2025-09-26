import { prisma } from '../config/database';
import * as dashboardController from '../controllers/dashboardController';
import { configService } from '../config/supervisorConfig';
import { getMQTTService } from './mqttService';

// Enhanced notification function (MQTT functionality removed)
async function notifyBookingUpdate(booking: any) {
  // MQTT functionality removed - notifications handled via API polling
  console.log(`Booking update: ${booking.id} - ${booking.seatsBooked} seats - $${booking.totalAmount}`);
}

// New function to emit financial updates for supervisor dashboard (MQTT functionality removed)
async function emitFinancialUpdate() {
  // MQTT functionality removed - notifications handled via API polling
  console.log('Financial update triggered');
}

export interface SimpleCashBookingRequest {
  destinationId: string;
  seatsRequested: number;
  staffId: string;
}

export interface SimpleCashBookingResult {
  success: boolean;
  bookings?: SimpleCashBooking[];
  error?: string;
  totalAmount?: number;
  ticketIds?: string[]; // Verification codes for cash tickets
}

export interface SimpleCashBooking {
  id: string;
  queueId: string;
  vehicleLicensePlate: string; // Vehicle number plate
  destinationName: string;
  destinationStationId: string; // Destination station ID
  startStationId: string; // Start/origin station ID
  startStationName: string; // Start/origin station name
  seatsBooked: number;
  pricePerSeat: number; // Price per seat from route
  baseAmount: number; // Base price amount
  serviceFeeAmount: number; // Service fee amount
  totalAmount: number; // Total amount (base + service fee)
  routeId?: string | undefined; // Route ID if available
  ticketId: string; // This is the verification code
  bookingTime: Date; // Time when booking was created
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

export class SimpleCashBookingService {
  private currentStationId: string;

  constructor() {
    this.currentStationId = configService.getStationId();
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
      console.log(`📊 Getting available seats for destination: ${destinationId}`);

      // Get all vehicles in queue for this destination
      const queueEntries = await prisma.vehicleQueue.findMany({
        where: {
          destinationId,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        include: {
          vehicle: true
        },
        orderBy: [
          { queueType: 'desc' }, // OVERNIGHT first
          { queuePosition: 'asc' }
        ]
      });

      if (queueEntries.length === 0) {
        return {
          success: false,
          error: `No vehicles available for destination ${destinationId}`
        };
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
          basePrice: entry.basePrice,
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
   * Create cash booking (simplified - no customer info needed) with race condition protection
   */
  async createCashBooking(bookingRequest: SimpleCashBookingRequest): Promise<SimpleCashBookingResult> {
    try {
      console.log(`🎫 Creating cash booking for ${bookingRequest.seatsRequested} seats to ${bookingRequest.destinationId}`);

      // Use a database transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        // Get available seats within the transaction for consistency
        const queueEntries = await tx.vehicleQueue.findMany({
          where: {
            destinationId: bookingRequest.destinationId,
            status: { in: ['WAITING', 'LOADING', 'READY'] }
          },
          include: {
            vehicle: true
          },
          orderBy: [
            { queueType: 'desc' }, // OVERNIGHT first
            { queuePosition: 'asc' }
          ]
        });

        if (queueEntries.length === 0) {
          throw new Error('No vehicles available for this destination');
        }

        // Calculate total available seats within transaction
        const totalAvailableSeats = queueEntries.reduce((sum, entry) => sum + entry.availableSeats, 0);

        // Check if we have enough seats (atomic check)
        if (totalAvailableSeats < bookingRequest.seatsRequested) {
          throw new Error(`Not enough seats available. Requested: ${bookingRequest.seatsRequested}, Available: ${totalAvailableSeats}`);
        }

        // Get station config for start station information
        const stationConfig = await tx.stationConfig.findFirst();
        const startStationId = stationConfig?.stationId || this.currentStationId;

        // Prepare vehicles data for allocation
        const vehicles: VehicleSeatingInfo[] = queueEntries.map(entry => ({
          queueId: entry.id,
          vehicleId: entry.vehicleId,
          licensePlate: entry.vehicle.licensePlate,
          queuePosition: entry.queuePosition,
          availableSeats: entry.availableSeats,
          totalSeats: entry.totalSeats,
          basePrice: entry.basePrice,
          status: entry.status,
          estimatedDeparture: entry.estimatedDeparture
        }));

        // Allocate seats across vehicles
        const allocation = this.allocateSeats(vehicles, bookingRequest.seatsRequested);
        
        if (allocation.length === 0) {
          throw new Error('Unable to allocate seats across available vehicles');
        }

        // Create bookings and update seats atomically
        const bookings: SimpleCashBooking[] = [];
        const ticketIds: string[] = [];
        let totalAmount = 0;

        for (const { vehicle, seatsToBook } of allocation) {
          // Double-check seat availability before booking (optimistic locking)
          const currentQueueEntry = await tx.vehicleQueue.findUnique({
            where: { id: vehicle.queueId },
            select: { availableSeats: true, id: true }
          });

          if (!currentQueueEntry) {
            throw new Error(`Vehicle queue ${vehicle.queueId} no longer exists`);
          }

          if (currentQueueEntry.availableSeats < seatsToBook) {
            throw new Error(`Insufficient seats on vehicle ${vehicle.licensePlate}. Available: ${currentQueueEntry.availableSeats}, Requested: ${seatsToBook}`);
          }

          const ticketId = this.generateTicketId();
          
          // Find the route to get correct pricing within transaction
          const route = await tx.route.findFirst({
            where: {
              stationId: bookingRequest.destinationId,
              isActive: true
            }
          });

          // Get station config for service fee
          const stationConfig = await tx.stationConfig.findFirst();
          const serviceFee = Number(stationConfig?.serviceFee || 0.200); // Convert Decimal to number, default to 0.200 TND if not set
          
          // Use route price if available, otherwise fall back to vehicle queue basePrice
          const pricePerSeat = route?.basePrice || vehicle.basePrice;
          
          // Calculate base amount and total amount with service fee
          const baseAmount = seatsToBook * pricePerSeat;
          const serviceFeeAmount = seatsToBook * serviceFee;
          const bookingAmount = baseAmount + serviceFeeAmount;

          // Create booking
          const booking = await tx.booking.create({
            data: {
              id: `cash_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              queueId: vehicle.queueId,
              seatsBooked: seatsToBook,
              totalAmount: bookingAmount,
              bookingSource: 'STATION',
              paymentStatus: 'PAID',
              paymentMethod: 'CASH',
              verificationCode: ticketId,
              createdBy: bookingRequest.staffId
            }
          });

          // Atomically update available seats with additional safety check
          const updatedQueue = await tx.vehicleQueue.updateMany({
            where: { 
              id: vehicle.queueId,
              availableSeats: { gte: seatsToBook } // Ensure we still have enough seats
            },
            data: {
              availableSeats: { decrement: seatsToBook }
            }
          });

          // Check if the update actually happened (no rows updated means conflict)
          if (updatedQueue.count === 0) {
            throw new Error(`Booking conflict: Seats on vehicle ${vehicle.licensePlate} were just booked by another user. Please try again.`);
          }

          // Get updated queue info to check if vehicle is now full
          const updatedQueueEntry = await tx.vehicleQueue.findUnique({
            where: { id: vehicle.queueId },
            include: { vehicle: true }
          });

          if (!updatedQueueEntry) {
            throw new Error('Vehicle queue entry not found after update');
          }

          // Note: Status will be updated automatically after transaction by calling updateVehicleStatusBasedOnBookings

          const cashBooking: SimpleCashBooking = {
            id: booking.id,
            queueId: booking.queueId,
            vehicleLicensePlate: updatedQueueEntry.vehicle.licensePlate,
            destinationName: updatedQueueEntry.destinationName,
            destinationStationId: updatedQueueEntry.destinationId,
            startStationId: startStationId,
            startStationName: stationConfig?.stationName || 'Local Station',
            seatsBooked: booking.seatsBooked,
            pricePerSeat: pricePerSeat,
            baseAmount: baseAmount,
            serviceFeeAmount: serviceFeeAmount,
            totalAmount: booking.totalAmount,
            ticketId: booking.verificationCode,
            bookingTime: new Date(),
            createdAt: booking.createdAt,
            queuePosition: updatedQueueEntry.queuePosition,
            estimatedDeparture: updatedQueueEntry.estimatedDeparture
          };

          bookings.push(cashBooking);
          ticketIds.push(ticketId);
          totalAmount += bookingAmount;

          console.log(`✅ Atomically booked ${seatsToBook} seats on vehicle ${vehicle.licensePlate} (${updatedQueueEntry.availableSeats} seats remaining)`);
        }

        return {
          success: true,
          bookings,
          totalAmount,
          ticketIds
        };
      });

      // Update vehicle statuses based on new bookings (outside transaction to avoid conflicts)
      for (const booking of result.bookings) {
        try {
          const { createQueueService } = await import('./queueService');
          const queueService = createQueueService();
          await queueService.updateVehicleStatusBasedOnBookings(booking.queueId);
        } catch (error) {
          console.error('❌ Error updating vehicle status after booking:', error);
        }
      }

      // Create trip records for fully booked vehicles (outside transaction to avoid conflicts)
      for (const booking of result.bookings) {
        const queueInfo = await prisma.vehicleQueue.findUnique({
          where: { id: booking.queueId },
          include: { vehicle: true }
        });
        
        if (queueInfo && queueInfo.status === 'READY' && queueInfo.availableSeats === 0) {
          await this.createTripRecord(booking.queueId, queueInfo);
        }
      }

      // Notify about successful booking AFTER transaction
      await notifyBookingUpdate(result.bookings[0]);

      // Broadcast booking update
      this.broadcastBookingUpdate(bookingRequest.destinationId);

      // MQTT: publish seat availability and booking-created events
      try {
        const mqtt = getMQTTService();
        const destinationId = bookingRequest.destinationId;
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
            verificationCode: b.ticketId
          });
        }
      } catch (e) {
        console.warn('⚠️ MQTT publish after cash booking failed:', e);
      }

      console.log(`🎉 Cash booking completed: ${bookingRequest.seatsRequested} seats across ${result.bookings.length} vehicle(s), Total: $${result.totalAmount}`);

      return result;

    } catch (error) {
      console.error('❌ Error creating cash booking:', error);
      
      // Broadcast immediate update to refresh all clients on failure
      this.broadcastBookingUpdate(bookingRequest.destinationId);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during booking'
      };
    }
  }

  /**
   * Verify cash ticket by ticket ID
   */
  async verifyCashTicket(ticketId: string, staffId: string): Promise<{
    success: boolean;
    booking?: SimpleCashBooking;
    error?: string;
  }> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { verificationCode: ticketId },
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
          error: 'Invalid ticket ID'
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

      // Get station config for start station information
      const stationConfig = await prisma.stationConfig.findFirst();
      const startStationId = stationConfig?.stationId || this.currentStationId;

      // Find the route to get correct pricing
      const route = await prisma.route.findFirst({
        where: {
          stationId: updatedBooking.queue.destinationId,
          isActive: true
        }
      });

      // Use route price if available, otherwise fall back to queue basePrice
      const pricePerSeat = route?.basePrice || updatedBooking.queue.basePrice;
      
      // Calculate breakdown from existing data
      const baseAmount = updatedBooking.seatsBooked * pricePerSeat;
      const serviceFeeAmount = updatedBooking.totalAmount - baseAmount; // Calculate service fee as difference

      const cashBooking: SimpleCashBooking = {
        id: updatedBooking.id,
        queueId: updatedBooking.queueId,
        vehicleLicensePlate: updatedBooking.queue.vehicle.licensePlate,
        destinationName: updatedBooking.queue.destinationName,
        destinationStationId: updatedBooking.queue.destinationId,
        startStationId: startStationId,
        startStationName: stationConfig?.stationName || 'Local Station',
        seatsBooked: updatedBooking.seatsBooked,
        pricePerSeat: pricePerSeat,
        baseAmount: baseAmount,
        serviceFeeAmount: serviceFeeAmount,
        totalAmount: updatedBooking.totalAmount,
        routeId: route?.id,
        ticketId: updatedBooking.verificationCode,
        bookingTime: new Date(),
        createdAt: updatedBooking.createdAt,
        queuePosition: updatedBooking.queue.queuePosition,
        estimatedDeparture: updatedBooking.queue.estimatedDeparture
      };

      console.log(`✅ Cash ticket verified: ${ticketId}`);

      return {
        success: true,
        booking: cashBooking
      };

    } catch (error) {
      console.error('❌ Error verifying cash ticket:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all destinations with available seats (filters out fully booked destinations)
   */
  async getAvailableDestinations(): Promise<{
    success: boolean;
    destinations?: Array<{
      destinationId: string;
      destinationName: string;
      totalAvailableSeats: number;
      vehicleCount: number;
    }>;
    error?: string;
  }> {
    try {
      console.log('📊 Getting available destinations for cash booking (filtering fully booked)...');
      
      // First get all destinations
      const allDestinations = await prisma.vehicleQueue.groupBy({
        by: ['destinationId', 'destinationName'],
        where: {
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        _sum: {
          availableSeats: true
        },
        _count: {
          id: true
        }
      });

      // Filter out destinations with no available seats
      const availableDestinations = allDestinations.filter(dest => 
        (dest._sum.availableSeats || 0) > 0
      );

      const result = availableDestinations.map(dest => ({
        destinationId: dest.destinationId,
        destinationName: dest.destinationName,
        totalAvailableSeats: dest._sum.availableSeats || 0,
        vehicleCount: dest._count.id
      }));

      const filteredOut = allDestinations.length - availableDestinations.length;
      console.log(`✅ Found ${result.length} destinations with available seats for cash booking (filtered out ${filteredOut} fully booked destinations)`);

      return {
        success: true,
        destinations: result
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
   * Intelligent seat allocation across vehicles
   */
  private allocateSeats(vehicles: VehicleSeatingInfo[], seatsRequested: number): Array<{
    vehicle: VehicleSeatingInfo;
    seatsToBook: number;
  }> {
    const allocation: Array<{ vehicle: VehicleSeatingInfo; seatsToBook: number }> = [];
    let remainingSeats = seatsRequested;

    // Sort vehicles by queue position
    const sortedVehicles = [...vehicles].sort((a, b) => a.queuePosition - b.queuePosition);

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
      return [];
    }

    return allocation;
  }

  /**
   * Generate ticket ID (same as verification code)
   */
  private generateTicketId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Generate QR code string
   */
  private generateQRCode(ticketId: string): string {
    return `LOUAJ_CASH_${ticketId}_${Date.now()}`;
  }

  /**
   * Broadcast booking update via local WebSocket
   */
  private broadcastBookingUpdate(destinationId: string): void {
    try {
      // Broadcast using local WebSocket server

      console.log(`📡 Broadcast booking update for destination: ${destinationId}`);

      // MQTT functionality removed - notifications handled via API polling
      console.log(`Queue update broadcast for destination: ${destinationId}`);

    } catch (error) {
      console.error('❌ Error broadcasting booking update:', error);
    }
  }

  /**
   * Create a trip record when a vehicle becomes READY (fully booked)
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

    } catch (error) {
      console.error('❌ Error creating trip record:', error);
    }
  }
}

export const createSimpleCashBookingService = () => {
  return new SimpleCashBookingService();
}; 