import { Request, Response } from 'express';
import { createQueueBookingService } from '../services/queueBookingService';
import { prisma } from '../config/database';
import { LoggingService } from '../services/loggingService';

export class QueueBookingController {
  private queueBookingService: ReturnType<typeof createQueueBookingService>;

  constructor() {
    this.queueBookingService = createQueueBookingService();
  }

  /**
   * Get available destinations with seat counts
   * GET /api/queue-booking/destinations
   */
  async getAvailableDestinations(req: Request, res: Response): Promise<void> {
    try {
      const { governorate, delegation } = req.query;
      
      const filters: { governorate?: string; delegation?: string } = {};
      if (governorate && typeof governorate === 'string') {
        filters.governorate = governorate;
      }
      if (delegation && typeof delegation === 'string') {
        filters.delegation = delegation;
      }

      const result = await this.queueBookingService.getAvailableDestinations(filters);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.destinations
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getAvailableDestinations controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get available locations (governments and delegations) for filtering
   * GET /api/queue-booking/locations
   */
  async getAvailableLocations(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.queueBookingService.getAvailableLocations();

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
   * Get available seats for a specific destination
   * GET /api/queue-booking/destinations/:destinationId/seats
   */
  async getAvailableSeats(req: Request, res: Response): Promise<void> {
    try {
      const { destinationId } = req.params;

      if (!destinationId) {
        res.status(400).json({
          success: false,
          error: 'Destination ID is required'
        });
        return;
      }

      const result = await this.queueBookingService.getAvailableSeats(destinationId);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.data
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getAvailableSeats controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Create a new cash booking (no customer info required)
   * POST /api/queue-booking/book
   */
  async createBooking(req: Request, res: Response): Promise<void> {
    try {
      const { destinationId, seatsRequested } = req.body;
      const staffId = req.staff?.id;

      // Validate input
      if (!destinationId || !seatsRequested ) {
        res.status(400).json({
          success: false,
          error: 'Destination ID and seats requested are required'
        });
        return;
      }

      if (!staffId) {
        res.status(401).json({
          success: false,
          error: 'Staff authentication required'
        });
        return;
      }

      if (typeof seatsRequested !== 'number' || seatsRequested <= 0 || seatsRequested > 20) {
        res.status(400).json({
          success: false,
          error: 'Seats requested must be a number between 1 and 20'
        });
        return;
      }

      const bookingRequest = {
        destinationId,
        seatsRequested,
        staffId,
        paymentMethod: 'CASH' as const, // Always cash payment
        bookingType: 'CASH' as const // Always cash booking
      };

      const result = await this.queueBookingService.createBooking(bookingRequest);

      if (result.success) {
        // Log the successful booking
        if (result.bookings && result.bookings.length > 0) {
          const firstBooking = result.bookings[0];
          await LoggingService.logBooking(
            staffId,
            firstBooking.vehicleLicensePlate,
            firstBooking.destinationName,
            seatsRequested,
            result.totalAmount || 0,
            'CASH',
            result.verificationCodes?.[0] || 'N/A'
          );
        }

        res.status(201).json({
          success: true,
          message: `Successfully booked ${seatsRequested} seat(s) `,
          data: {
            bookings: result.bookings,
            totalAmount: result.totalAmount,
            verificationCodes: result.verificationCodes,
            summary: {
              totalSeats: seatsRequested,
              totalAmount: result.totalAmount,
              vehicleCount: result.bookings?.length || 0,
            }
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in createBooking controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Create multiple bookings in a single optimized transaction
   * POST /api/queue-booking/batch-book
   */
  async createBatchBookings(req: Request, res: Response): Promise<void> {
    try {
      const { bookings } = req.body;
      const staffId = req.staff?.id;

      // Validate input
      if (!Array.isArray(bookings) || bookings.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Bookings array is required and must not be empty'
        });
        return;
      }

      if (!staffId) {
        res.status(401).json({
          success: false,
          error: 'Staff authentication required'
        });
        return;
      }

      // Validate each booking request
      for (const booking of bookings) {
        if (!booking.destinationId || !booking.seatsRequested) {
          res.status(400).json({
            success: false,
            error: 'Each booking must have destinationId and seatsRequested'
          });
          return;
        }

        if (typeof booking.seatsRequested !== 'number' || booking.seatsRequested <= 0 || booking.seatsRequested > 20) {
          res.status(400).json({
            success: false,
            error: 'Seats requested must be a number between 1 and 20 for each booking'
          });
          return;
        }
      }

      const batchBookingRequest = {
        bookings: bookings.map(booking => ({
          destinationId: booking.destinationId,
          seatsRequested: booking.seatsRequested
        })),
        staffId,
        paymentMethod: 'CASH' as const,
        bookingType: 'CASH' as const
      };

      const result = await this.queueBookingService.createBatchBookings(batchBookingRequest);

      if (result.success) {
        // Log the successful batch booking
        if (result.bookings && result.bookings.length > 0) {
          for (const booking of result.bookings) {
            await LoggingService.logBooking(
              staffId,
              booking.vehicleLicensePlate,
              booking.destinationName,
              booking.seatsBooked,
              booking.totalAmount,
              'CASH',
              booking.verificationCode
            );
          }
        }

        res.status(201).json({
          success: true,
          message: `Successfully created ${result.bookings?.length || 0} booking(s)`,
          data: {
            bookings: result.bookings,
            totalAmount: result.totalAmount,
            verificationCodes: result.verificationCodes,
            summary: {
              totalBookings: result.bookings?.length || 0,
              totalSeats: result.bookings?.reduce((sum, b) => sum + b.seatsBooked, 0) || 0,
              totalAmount: result.totalAmount
            }
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in createBatchBookings controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get booking by verification code
   * GET /api/queue-booking/verify/:verificationCode
   */
  async getBooking(req: Request, res: Response): Promise<void> {
    try {
      const { verificationCode } = req.params;

      if (!verificationCode) {
        res.status(400).json({
          success: false,
          error: 'Verification code is required'
        });
        return;
      }

      const result = await this.queueBookingService.getBookingByVerificationCode(verificationCode);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.booking
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error('❌ Error in getBooking controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Verify and mark ticket as used
   * POST /api/queue-booking/verify
   */
  async verifyTicket(req: Request, res: Response): Promise<void> {
    try {
      const { verificationCode } = req.body;
      const staffId = req.staff?.id;

      if (!verificationCode) {
        res.status(400).json({
          success: false,
          error: 'Verification code is required'
        });
        return;
      }

      if (!staffId) {
        res.status(401).json({
          success: false,
          error: 'Staff authentication required'
        });
        return;
      }

      // Try to verify the ticket
      const result = await this.queueBookingService.verifyTicket(verificationCode, staffId);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Ticket verified successfully',
          data: result.booking,
          justVerified: true
        });
        return;
      }

      // If already verified, fetch and return ticket details with a flag
      if (result.error === 'Ticket already verified') {
        const bookingResult = await this.queueBookingService.getBookingByVerificationCode(verificationCode);
        if (bookingResult.success) {
          res.status(200).json({
            success: true,
            message: 'Ticket was already verified',
            data: bookingResult.booking,
            justVerified: false
          });
        } else {
          res.status(404).json({
            success: false,
            error: bookingResult.error || 'Ticket not found'
          });
        }
        return;
      }

      // Other errors
      res.status(400).json({
        success: false,
        error: result.error
      });
    } catch (error) {
      console.error('❌ Error in verifyTicket controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Cancel booking or remove specific number of seats
   * DELETE /api/queue-booking/cancel/:bookingId
   * PUT /api/queue-booking/cancel/:bookingId
   */
  async cancelBooking(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;
      const { seatsToCancel } = req.body || {}; // Optional: number of seats to cancel (if not provided, cancels entire booking)
      const staffId = req.staff?.id;

      if (!bookingId) {
        res.status(400).json({
          success: false,
          error: 'Booking ID is required'
        });
        return;
      }

      if (!staffId) {
        res.status(401).json({
          success: false,
          error: 'Staff authentication required'
        });
        return;
      }

      // Validate seatsToCancel if provided
      if (seatsToCancel !== undefined) {
        if (typeof seatsToCancel !== 'number' || seatsToCancel <= 0) {
          res.status(400).json({
            success: false,
            error: 'Seats to cancel must be a positive number'
          });
          return;
        }
      }

      console.log(`🚫 Staff ${staffId} cancelling booking ${bookingId}${seatsToCancel ? `, ${seatsToCancel} seats` : ' (completely)'}`);

      const result = await this.queueBookingService.cancelBooking(bookingId, seatsToCancel, staffId);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          data: {
            cancelledCompletely: result.cancelledCompletely,
            seatsRestored: result.seatsRestored,
            updatedBooking: result.updatedBooking
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to cancel booking'
        });
      }

    } catch (error) {
      console.error('❌ Error in cancelBooking controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get booking statistics
   * GET /api/queue-booking/stats
   */
  async getBookingStats(req: Request, res: Response): Promise<void> {
    try {
      // Get today's bookings
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayStats = await prisma.booking.groupBy({
        by: ['queueId'],
        where: {
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        },
        _sum: {
          seatsBooked: true,
          totalAmount: true
        },
        _count: {
          id: true
        }
      });

      const totalBookingsToday = todayStats.reduce((sum: number, stat: any) => sum + stat._count.id, 0);
      const totalSeatsBooked = todayStats.reduce((sum: number, stat: any) => sum + (stat._sum.seatsBooked || 0), 0);
      const totalRevenue = todayStats.reduce((sum: number, stat: any) => sum + (stat._sum.totalAmount || 0), 0);

      // Get pending verifications
      const pendingVerifications = await prisma.booking.count({
        where: {
          isVerified: false,
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        }
      });

      res.status(200).json({
        success: true,
        data: {
          today: {
            totalBookings: totalBookingsToday,
            totalSeats: totalSeatsBooked,
            totalRevenue: totalRevenue,
            pendingVerifications
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error in getBookingStats controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

}

export const createQueueBookingController = () => {
  return new QueueBookingController();
};