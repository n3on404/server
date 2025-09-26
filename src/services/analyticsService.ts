import { getRedisService } from './redisService';
import { REDIS_KEYS, CACHE_TTL } from '../config/redisConfig';
import { prisma } from '../config/database';

export interface DailyStats {
  date: string;
  totalBookings: number;
  totalRevenue: number;
  totalSeats: number;
  activeVehicles: number;
  queueUpdates: number;
  staffLogins: number;
  averageBookingValue: number;
  peakHours: { hour: number; bookings: number }[];
}

export interface RealTimeStats {
  activeSessions: number;
  vehiclesInQueue: number;
  totalAvailableSeats: number;
  bookingsToday: number;
  revenueToday: number;
  lastUpdate: string;
}

export class AnalyticsService {
  private redis = getRedisService();

  /**
   * Get real-time statistics from Redis
   */
  async getRealTimeStats(): Promise<RealTimeStats> {
    try {
      if (!this.redis.getConnectionStatus()) {
        return await this.getFallbackStats();
      }

      const today = new Date().toISOString().split('T')[0];
      
      const [
        activeSessions,
        vehiclesInQueue,
        totalAvailableSeats,
        bookingsToday,
        revenueToday
      ] = await Promise.all([
        this.redis.getDailyStats('active_sessions'),
        this.redis.getDailyStats('vehicles_in_queue'),
        this.redis.getDailyStats('total_available_seats'),
        this.redis.getDailyStats('bookings_created'),
        this.redis.getDailyStats('revenue')
      ]);

      return {
        activeSessions,
        vehiclesInQueue,
        totalAvailableSeats,
        bookingsToday,
        revenueToday,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting real-time stats:', error);
      return await this.getFallbackStats();
    }
  }

  /**
   * Get daily statistics for a specific date
   */
  async getDailyStats(date: string): Promise<DailyStats> {
    try {
      if (!this.redis.getConnectionStatus()) {
        return await this.getDailyStatsFromDB(date);
      }

      const [
        totalBookings,
        totalRevenue,
        totalSeats,
        activeVehicles,
        queueUpdates,
        staffLogins
      ] = await Promise.all([
        this.redis.getDailyStats('bookings_created'),
        this.redis.getDailyStats('revenue'),
        this.redis.getDailyStats('total_seats'),
        this.redis.getDailyStats('active_vehicles'),
        this.redis.getDailyStats('queue_updates'),
        this.redis.getDailyStats('staff_logins')
      ]);

      const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      return {
        date,
        totalBookings,
        totalRevenue,
        totalSeats,
        activeVehicles,
        queueUpdates,
        staffLogins,
        averageBookingValue,
        peakHours: await this.getPeakHours(date)
      };
    } catch (error) {
      console.error('❌ Error getting daily stats:', error);
      return await this.getDailyStatsFromDB(date);
    }
  }

  /**
   * Get peak hours for a specific date
   */
  private async getPeakHours(date: string): Promise<{ hour: number; bookings: number }[]> {
    try {
      if (!this.redis.getConnectionStatus()) {
        return [];
      }

      const peakHours: { hour: number; bookings: number }[] = [];
      
      for (let hour = 0; hour < 24; hour++) {
        const bookings = await this.redis.getDailyStats(`bookings_hour_${hour}`);
        if (bookings > 0) {
          peakHours.push({ hour, bookings });
        }
      }

      return peakHours.sort((a, b) => b.bookings - a.bookings);
    } catch (error) {
      console.error('❌ Error getting peak hours:', error);
      return [];
    }
  }

  /**
   * Track booking creation
   */
  async trackBooking(amount: number, seats: number): Promise<void> {
    try {
      if (!this.redis.getConnectionStatus()) return;

      const now = new Date();
      const hour = now.getHours();

      await Promise.all([
        this.redis.incrementDailyStats('bookings_created'),
        this.redis.incrementDailyStats('revenue', amount),
        this.redis.incrementDailyStats('total_seats', seats),
        this.redis.incrementDailyStats(`bookings_hour_${hour}`)
      ]);

      console.log(`📊 Tracked booking: ${amount} TND, ${seats} seats`);
    } catch (error) {
      console.error('❌ Error tracking booking:', error);
    }
  }

  /**
   * Track vehicle queue entry
   */
  async trackVehicleQueueEntry(seats: number): Promise<void> {
    try {
      if (!this.redis.getConnectionStatus()) return;

      await Promise.all([
        this.redis.incrementDailyStats('vehicles_in_queue'),
        this.redis.incrementDailyStats('total_available_seats', seats),
        this.redis.incrementDailyStats('queue_updates')
      ]);

      console.log(`📊 Tracked vehicle queue entry: ${seats} seats`);
    } catch (error) {
      console.error('❌ Error tracking vehicle queue entry:', error);
    }
  }

  /**
   * Track staff login
   */
  async trackStaffLogin(): Promise<void> {
    try {
      if (!this.redis.getConnectionStatus()) return;

      await this.redis.incrementDailyStats('staff_logins');
      console.log(`📊 Tracked staff login`);
    } catch (error) {
      console.error('❌ Error tracking staff login:', error);
    }
  }

  /**
   * Track active session
   */
  async trackActiveSession(): Promise<void> {
    try {
      if (!this.redis.getConnectionStatus()) return;

      await this.redis.incrementDailyStats('active_sessions');
    } catch (error) {
      console.error('❌ Error tracking active session:', error);
    }
  }

  /**
   * Get fallback statistics from database
   */
  private async getFallbackStats(): Promise<RealTimeStats> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        activeSessions,
        vehiclesInQueue,
        bookingsToday,
        revenueToday
      ] = await Promise.all([
        prisma.session.count(),
        prisma.vehicleQueue.count({ where: { status: 'WAITING' } }),
        prisma.booking.count({
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow
            }
          }
        }),
        prisma.booking.aggregate({
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow
            }
          },
          _sum: { totalAmount: true }
        })
      ]);

      const totalAvailableSeats = await prisma.vehicleQueue.aggregate({
        where: { status: 'WAITING' },
        _sum: { availableSeats: true }
      });

      return {
        activeSessions,
        vehiclesInQueue,
        totalAvailableSeats: totalAvailableSeats._sum.availableSeats || 0,
        bookingsToday,
        revenueToday: revenueToday._sum.totalAmount || 0,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting fallback stats:', error);
      return {
        activeSessions: 0,
        vehiclesInQueue: 0,
        totalAvailableSeats: 0,
        bookingsToday: 0,
        revenueToday: 0,
        lastUpdate: new Date().toISOString()
      };
    }
  }

  /**
   * Get daily statistics from database
   */
  private async getDailyStatsFromDB(date: string): Promise<DailyStats> {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      const [
        totalBookings,
        revenueData,
        seatsData,
        activeVehicles
      ] = await Promise.all([
        prisma.booking.count({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate
            }
          }
        }),
        prisma.booking.aggregate({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate
            }
          },
          _sum: { totalAmount: true }
        }),
        prisma.booking.aggregate({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate
            }
          },
          _sum: { seatsBooked: true }
        }),
        prisma.vehicleQueue.count({
          where: {
            enteredAt: {
              gte: startDate,
              lt: endDate
            }
          }
        })
      ]);

      const totalRevenue = revenueData._sum.totalAmount || 0;
      const totalSeats = seatsData._sum.seatsBooked || 0;
      const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      return {
        date,
        totalBookings,
        totalRevenue,
        totalSeats,
        activeVehicles,
        queueUpdates: 0, // Not tracked in DB
        staffLogins: 0, // Not tracked in DB
        averageBookingValue,
        peakHours: [] // Would need hourly breakdown in DB
      };
    } catch (error) {
      console.error('❌ Error getting daily stats from DB:', error);
      return {
        date,
        totalBookings: 0,
        totalRevenue: 0,
        totalSeats: 0,
        activeVehicles: 0,
        queueUpdates: 0,
        staffLogins: 0,
        averageBookingValue: 0,
        peakHours: []
      };
    }
  }

  /**
   * Clear all analytics data
   */
  async clearAnalytics(): Promise<boolean> {
    try {
      if (!this.redis.getConnectionStatus()) return false;

      const keys = await this.redis.keys(`${REDIS_KEYS.DAILY_STATS}*`);
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redis.del(key);
        }
      }

      console.log(`✅ Cleared ${keys.length} analytics keys`);
      return true;
    } catch (error) {
      console.error('❌ Error clearing analytics:', error);
      return false;
    }
  }
}

// Singleton instance
let analyticsService: AnalyticsService | null = null;

export const getAnalyticsService = (): AnalyticsService => {
  if (!analyticsService) {
    analyticsService = new AnalyticsService();
  }
  return analyticsService;
};

export default getAnalyticsService;