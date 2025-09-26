import { Request, Response } from 'express';
import { dayPassService } from '../services/dayPassService';
import { LoggingService } from '../services/loggingService';
import prisma from '../config/database';

export class DayPassController {
  /**
   * Purchase a day pass for a vehicle
   */
  async purchaseDayPass(req: Request, res: Response): Promise<void> {
    try {
      const { vehicleId, licensePlate, price } = req.body;
      const staffId = req.staff?.id;

      if (!staffId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      if (!vehicleId || !licensePlate) {
        res.status(400).json({
          success: false,
          message: 'Données manquantes: vehicleId et licensePlate sont requis'
        });
        return;
      }

      const result = await dayPassService.purchaseDayPass({
        vehicleId,
        licensePlate,
        price,
        createdBy: staffId
      });

      const loggingService = new LoggingService();
      await loggingService.log('DAY_PASS_API_PURCHASE', {
        staffId,
        vehicleId,
        licensePlate,
        dayPassId: result.id
      });

      res.status(201).json({
        success: true,
        message: 'Pass journalier acheté avec succès',
        data: result
      });
    } catch (error) {
      console.error('Error in purchaseDayPass controller:', error);
      const loggingService = new LoggingService();
      await loggingService.log('DAY_PASS_API_ERROR', {
        action: 'PURCHASE_DAY_PASS',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'achat du pass journalier',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get day pass status by license plate
   */
  async getDayPassStatusByLicensePlate(req: Request, res: Response): Promise<void> {
    try {
      const { licensePlate } = req.params;

      if (!licensePlate) {
        res.status(400).json({
          success: false,
          message: 'licensePlate est requis'
        });
        return;
      }

      // Find vehicle by license plate
      const vehicle = await prisma.vehicle.findUnique({
        where: { licensePlate }
      });

      if (!vehicle) {
        res.status(404).json({
          success: false,
          message: `Véhicule avec la plaque ${licensePlate} non trouvé`
        });
        return;
      }

      // Simplified day pass system - no driver validation needed
      const status = {
        hasValidDayPass: false,
        dayPassExpiresAt: null,
        message: 'Day pass system simplified - no driver validation required'
      };
      
      console.log(`Day pass status for vehicle ${licensePlate}:`, status);

      res.json({
        success: true,
        data: {
          ...status,
          vehicle: {
            licensePlate: vehicle.licensePlate,
            capacity: vehicle.capacity
          }
        }
      });
    } catch (error) {
      console.error('Error in getDayPassStatusByLicensePlate controller:', error);
      const loggingService = new LoggingService();
      await loggingService.log('DAY_PASS_API_ERROR', {
        action: 'GET_DAY_PASS_STATUS',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du statut du pass journalier',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get day pass price
   */
  async getDayPassPrice(req: Request, res: Response): Promise<void> {
    try {
      const price = await dayPassService.getDayPassPrice();
      
      res.json({
        success: true,
        data: { price }
      });
    } catch (error) {
      console.error('Error in getDayPassPrice controller:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du prix',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get today's day passes
   */
  async getTodayDayPasses(req: Request, res: Response): Promise<void> {
    try {
      const dayPasses = await dayPassService.getTodayDayPasses();
      
      res.json({
        success: true,
        data: dayPasses
      });
    } catch (error) {
      console.error('Error in getTodayDayPasses controller:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des passes journaliers',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get day pass statistics
   */
  async getDayPassStats(req: Request, res: Response): Promise<void> {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : undefined;
      
      const stats = await dayPassService.getDayPassStats(targetDate);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error in getDayPassStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Expire all day passes (admin function)
   */
  async expireAllDayPasses(req: Request, res: Response): Promise<void> {
    try {
      const result = await dayPassService.expireAllDayPasses();
      
      res.json({
        success: true,
        message: `${result.expired} passes journaliers ont été expirés`,
        data: {
          expiredCount: result.expired,
          message: result.message
        }
      });
    } catch (error) {
      console.error('Error in expireAllDayPasses controller:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'expiration des passes journaliers',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const dayPassController = new DayPassController();