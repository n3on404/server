import { Router, Request, Response } from 'express';
import { authenticate, requireSupervisor } from '../middleware/auth';
import { getAnalyticsService } from '../services/analyticsService';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(requireSupervisor);

/**
 * GET /api/analytics/realtime
 * Get real-time statistics
 */
router.get('/realtime', async (req: Request, res: Response) => {
  try {
    const analytics = getAnalyticsService();
    const stats = await analytics.getRealTimeStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting real-time stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get real-time statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/daily/:date
 * Get daily statistics for a specific date
 */
router.get('/daily/:date', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.params;
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
      return;
    }

    const analytics = getAnalyticsService();
    const stats = await analytics.getDailyStats(date);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting daily stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get daily statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/daily
 * Get today's statistics
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const analytics = getAnalyticsService();
    const stats = await analytics.getDailyStats(today);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting today stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get today statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/analytics/track/booking
 * Track a booking (internal use)
 */
router.post('/track/booking', async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, seats } = req.body;

    if (!amount || !seats) {
      res.status(400).json({
        success: false,
        message: 'Amount and seats are required'
      });
      return;
    }

    const analytics = getAnalyticsService();
    await analytics.trackBooking(amount, seats);

    res.json({
      success: true,
      message: 'Booking tracked successfully'
    });
  } catch (error) {
    console.error('❌ Error tracking booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track booking',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/analytics/track/vehicle-queue
 * Track vehicle queue entry (internal use)
 */
router.post('/track/vehicle-queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const { seats } = req.body;

    if (!seats) {
      res.status(400).json({
        success: false,
        message: 'Seats are required'
      });
      return;
    }

    const analytics = getAnalyticsService();
    await analytics.trackVehicleQueueEntry(seats);

    res.json({
      success: true,
      message: 'Vehicle queue entry tracked successfully'
    });
  } catch (error) {
    console.error('❌ Error tracking vehicle queue entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track vehicle queue entry',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/analytics/track/staff-login
 * Track staff login (internal use)
 */
router.post('/track/staff-login', async (req: Request, res: Response) => {
  try {
    const analytics = getAnalyticsService();
    await analytics.trackStaffLogin();

    res.json({
      success: true,
      message: 'Staff login tracked successfully'
    });
  } catch (error) {
    console.error('❌ Error tracking staff login:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track staff login',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/analytics/clear
 * Clear all analytics data (ADMIN only)
 */
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const analytics = getAnalyticsService();
    const cleared = await analytics.clearAnalytics();

    if (cleared) {
      res.json({
        success: true,
        message: 'Analytics data cleared successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clear analytics data'
      });
    }
  } catch (error) {
    console.error('❌ Error clearing analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear analytics data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;