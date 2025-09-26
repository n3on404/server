import { Router } from 'express';
import { createQueueBookingController } from '../controllers/queueBookingController';
import { authenticate, requireStaff } from '../middleware/auth';

// Create a function that returns the router with the controller
export default function createQueueBookingRouter() {
  const router = Router();
  
  // Create controller without WebSocket service
  const queueBookingController = createQueueBookingController();

  // Apply authentication middleware to all routes
  router.use(authenticate);
  router.use(requireStaff);

  /**
   * @route GET /api/queue-booking/destinations
   * @desc Get all available destinations with seat counts
   * @access Private (Staff only)
   * @query { governorate?: string, delegation?: string } - Optional filters
   */
  router.get('/destinations', queueBookingController.getAvailableDestinations.bind(queueBookingController));

  /**
   * @route GET /api/queue-booking/locations
   * @desc Get available governments and delegations for filtering
   * @access Private (Staff only)
   */
  router.get('/locations', queueBookingController.getAvailableLocations.bind(queueBookingController));

  /**
   * @route GET /api/queue-booking/destinations/:destinationId/seats
   * @desc Get available seats for a specific destination
   * @access Private (Staff only)
   * @param {string} destinationId - The destination station ID
   */
  router.get('/destinations/:destinationId/seats', queueBookingController.getAvailableSeats.bind(queueBookingController));

  /**
   * @route POST /api/queue-booking/book
   * @desc Create a new cash booking (no customer info required)
   * @access Private (Staff only)
   * @body { destinationId: string, seatsRequested: number }
   */
  router.post('/book', queueBookingController.createBooking.bind(queueBookingController));

  /**
   * @route POST /api/queue-booking/batch-book
   * @desc Create multiple bookings in a single optimized transaction
   * @access Private (Staff only)
   * @body { bookings: Array<{ destinationId: string, seatsRequested: number }> }
   */
  router.post('/batch-book', queueBookingController.createBatchBookings.bind(queueBookingController));

  /**
   * @route GET /api/queue-booking/verify/:verificationCode
   * @desc Get booking details by verification code
   * @access Private (Staff only)
   * @param {string} verificationCode - The booking verification code
   */
  router.get('/verify/:verificationCode', queueBookingController.getBooking.bind(queueBookingController));

  /**
   * @route POST /api/queue-booking/verify
   * @desc Verify and mark ticket as used
   * @access Private (Staff only)
   * @body { verificationCode: string }
   */
  router.post('/verify', queueBookingController.verifyTicket.bind(queueBookingController));

  /**
   * @route DELETE /api/queue-booking/cancel/:bookingId
   * @route PUT /api/queue-booking/cancel/:bookingId
   * @desc Cancel booking completely or remove specific number of seats
   * @access Private (Staff only)
   * @param {string} bookingId - The booking ID to cancel
   * @body { seatsToCancel?: number } - Optional number of seats to cancel (if not provided, cancels entire booking)
   */
  router.delete('/cancel/:bookingId', queueBookingController.cancelBooking.bind(queueBookingController));
  router.put('/cancel/:bookingId', queueBookingController.cancelBooking.bind(queueBookingController));


  /**
   * @route GET /api/queue-booking/stats
   * @desc Get booking statistics for today
   * @access Private (Staff only)
   */
  router.get('/stats', queueBookingController.getBookingStats.bind(queueBookingController));

  return router;
} 