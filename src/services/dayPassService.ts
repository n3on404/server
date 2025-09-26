import { prisma } from '../config/database';

export class DayPassService {
  /**
   * Create a day pass for a vehicle
   */
  async createDayPass(data: {
    vehicleId: string;
    licensePlate: string;
    price?: number;
    createdBy: string;
  }) {
    try {
      const dayPass = await prisma.dayPass.create({
        data: {
          vehicleId: data.vehicleId,
          licensePlate: data.licensePlate,
          price: data.price || 2.0,
          createdBy: data.createdBy,
          purchaseDate: new Date(),
          validFrom: new Date(new Date().setHours(0, 0, 0, 0)), // Start of today
          validUntil: new Date(new Date().setHours(23, 59, 59, 999)), // End of today
          isActive: true,
          isExpired: false
        },
        include: {
          vehicle: true,
          createdByStaff: true
        }
      });

      console.log(`✅ Day pass created for vehicle ${data.licensePlate}`);
      return dayPass;
    } catch (error) {
      console.error('Error creating day pass:', error);
      throw error;
    }
  }

  /**
   * Get day pass status for a vehicle
   */
  async getDayPassStatus(vehicleId: string) {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      const dayPass = await prisma.dayPass.findFirst({
        where: {
          vehicleId,
          validFrom: { lte: endOfDay },
          validUntil: { gte: startOfDay },
          isActive: true,
          isExpired: false
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        hasValidDayPass: !!dayPass,
        dayPassExpiresAt: dayPass?.validUntil || null,
        message: dayPass ? 'Valid day pass found' : 'No valid day pass found'
      };
    } catch (error) {
      console.error('Error getting day pass status:', error);
      throw error;
    }
  }

  /**
   * Validate day pass for a vehicle
   */
  async validateDayPass(vehicleId: string) {
    try {
      const status = await this.getDayPassStatus(vehicleId);
      
      if (!status.hasValidDayPass) {
        return {
          isValid: false,
          message: 'No valid day pass found for this vehicle'
        };
      }

      return {
        isValid: true,
        message: 'Valid day pass found',
        expiresAt: status.dayPassExpiresAt
      };
    } catch (error) {
      console.error('Error validating day pass:', error);
      return {
        isValid: false,
        message: 'Error validating day pass'
      };
    }
  }

  /**
   * Get all day passes for a vehicle
   */
  async getVehicleDayPasses(vehicleId: string) {
    try {
      const dayPasses = await prisma.dayPass.findMany({
        where: { vehicleId },
        include: {
          vehicle: true,
          createdByStaff: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return dayPasses;
    } catch (error) {
      console.error('Error getting vehicle day passes:', error);
      throw error;
    }
  }

  /**
   * Purchase a day pass for a vehicle
   */
  async purchaseDayPass(data: {
    vehicleId: string;
    licensePlate: string;
    price?: number;
    createdBy: string;
  }) {
    return this.createDayPass(data);
  }

  /**
   * Get day pass price
   */
  async getDayPassPrice() {
    return 2.0; // Fixed price
  }

  /**
   * Get today's day passes
   */
  async getTodayDayPasses() {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      return await prisma.dayPass.findMany({
        where: {
          purchaseDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        include: {
          vehicle: true,
          createdByStaff: true
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.error('Error getting today\'s day passes:', error);
      throw error;
    }
  }

  /**
   * Get day pass statistics
   */
  async getDayPassStats(targetDate?: Date) {
    try {
      const date = targetDate || new Date();
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const totalPasses = await prisma.dayPass.count({
        where: {
          purchaseDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      });

      const activePasses = await prisma.dayPass.count({
        where: {
          purchaseDate: {
            gte: startOfDay,
            lte: endOfDay
          },
          isActive: true,
          isExpired: false
        }
      });

      const totalRevenue = await prisma.dayPass.aggregate({
        where: {
          purchaseDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        _sum: {
          price: true
        }
      });

      return {
        totalPasses,
        activePasses,
        expiredPasses: totalPasses - activePasses,
        totalRevenue: totalRevenue._sum.price || 0
      };
    } catch (error) {
      console.error('Error getting day pass stats:', error);
      throw error;
    }
  }

  /**
   * Expire all day passes (admin function)
   */
  async expireAllDayPasses() {
    return this.expireOldDayPasses();
  }

  /**
   * Expire old day passes (cron job)
   */
  async expireOldDayPasses() {
    try {
      const now = new Date();
      
      const expiredPasses = await prisma.dayPass.findMany({
        where: {
          validUntil: { lt: now },
          isActive: true,
          isExpired: false
        }
      });

      if (expiredPasses.length === 0) {
        return { expired: 0, message: 'No day passes to expire' };
      }

      await prisma.dayPass.updateMany({
        where: {
          id: { in: expiredPasses.map(p => p.id) }
        },
        data: {
          isExpired: true,
          isActive: false
        }
      });

      console.log(`✅ Expired ${expiredPasses.length} day passes`);
      return { expired: expiredPasses.length, message: `${expiredPasses.length} day passes expired` };
    } catch (error) {
      console.error('Error expiring day passes:', error);
      throw error;
    }
  }
}

export const dayPassService = new DayPassService();