import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { getRedisService } from './redisService';
import { REDIS_KEYS, CACHE_TTL } from '../config/redisConfig';

const prisma = new PrismaClient();

export interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;
  staff?: any;
}

export interface TokenPayload {
  staffId: string;
  cin: string;
  role: string;
  stationId: string;
}

export class LocalAuthService {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = '125169cc5d865676c9b13ec2df5926cc942ff45e84eb931d6e2cef2940f8efbc';
  }

  /**
   * Login with CIN only (no password required)
   */
  async login(cin: string): Promise<LoginResponse> {
    try {
      console.log(`🔐 Attempting login for CIN: ${cin}`);

      // Use local authentication only
      const localResult = await this.loginLocally(cin);
      if (localResult.success) {
        return localResult;
      }

      return {
        success: false,
        message: 'Invalid CIN'
      };

    } catch (error) {
      console.error('❌ Local auth login error:', error);
      
      if (error instanceof Error && error.message.includes('not connected')) {
        return {
          success: false,
          message: 'Station not connected to central server. Please check your internet connection.'
        };
      }

      return {
        success: false,
        message: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Login using local database with Redis session management (CIN only)
   */
  private async loginLocally(cin: string): Promise<LoginResponse> {
    try {
      const redis = getRedisService();
      
      // Check for existing active session in Redis
      const existingSessionKey = `${REDIS_KEYS.SESSION}active:${cin}`;
      if (redis.getConnectionStatus()) {
        const existingSession = await redis.get(existingSessionKey);
        if (existingSession) {
          console.log(`⚠️ Active session found for CIN: ${cin}, invalidating previous session`);
          await redis.del(existingSessionKey);
        }
      }

      // Find staff member in local database
      const staff = await prisma.staff.findUnique({
        where: { cin }
      });

      if (!staff || !staff.isActive) {
        return {
          success: false,
          message: 'Invalid CIN'
        };
      }

      // No password verification needed - CIN is sufficient
      console.log(`✅ CIN verification successful for: ${staff.firstName} ${staff.lastName}`);

      // Create JWT token
      const tokenPayload: TokenPayload = {
        staffId: staff.id,
        cin: staff.cin,
        role: staff.role,
        stationId: 'local' // Local station ID
      };

      const token = jwt.sign(tokenPayload, this.jwtSecret, { expiresIn: '30d' });

      // Update last login time
      await prisma.staff.update({
        where: { id: staff.id },
        data: { lastLogin: new Date() }
      });

      // Store session in Redis for fast access
      const sessionData = {
        id: staff.id,
        cin: staff.cin,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        phoneNumber: staff.phoneNumber,
        lastLogin: new Date().toISOString(),
        loginTime: new Date().toISOString()
      };

      if (redis.getConnectionStatus()) {
        // Store in Redis with TTL
        await redis.setStaffToken(token, sessionData);
        await redis.setSession(`${REDIS_KEYS.SESSION}active:${cin}`, sessionData);
        
        // Track active sessions
        await redis.sadd(`${REDIS_KEYS.SESSION}active_staff`, staff.id);
        await redis.sadd(`${REDIS_KEYS.SESSION}active_tokens`, token);
        
        console.log(`✅ Session stored in Redis for CIN: ${cin}`);
      }

      // Store session in database for token verification (fallback)
      const sessionResult = await this.storeSession(token, sessionData);

      if (!sessionResult.success) {
        console.error('❌ Failed to store session locally:', sessionResult.error);
      }

      console.log(`✅ Local login successful: ${staff.firstName} ${staff.lastName}`);

      return {
        success: true,
        message: 'Login successful',
        token,
        staff: {
          id: staff.id,
          cin: staff.cin,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: staff.role,
          phoneNumber: staff.phoneNumber
        }
      };

    } catch (error) {
      console.error('❌ Local login error:', error);
      return {
        success: false,
        message: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Verify token with Redis caching (check Redis first, then local database)
   */
  async verifyToken(token: string): Promise<{ valid: boolean; staff?: any; error?: string; source?: string }> {
    try {
      const redis = getRedisService();
      
      // First try to verify from Redis cache
      if (redis.getConnectionStatus()) {
        const cachedStaff = await redis.getStaffToken(token);
        if (cachedStaff) {
          console.log(`✅ Token verified from Redis cache for staff: ${cachedStaff.firstName} ${cachedStaff.lastName}`);
          return { valid: true, staff: cachedStaff, source: 'redis' };
        }
      }

      // Fallback to local database verification
      const localResult = await this.verifyTokenLocally(token);
      
      if (localResult.valid) {
        // Cache the result in Redis for future requests
        if (redis.getConnectionStatus()) {
          await redis.setStaffToken(token, localResult.staff);
        }
        
        console.log(`✅ Token verified locally for staff: ${localResult.staff?.firstName} ${localResult.staff?.lastName}`);
        return { ...localResult, source: 'local' };
      }

      return { valid: false, error: 'Invalid or expired token', source: 'local' };

    } catch (error) {
      console.error('❌ Token verification error:', error);
      return { valid: false, error: 'Token verification failed', source: 'error' };
    }
  }

  /**
   * Store session in local database for offline use
   */
  private async storeSession(token: string, staff: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Decode token to get expiration
      const decoded = jwt.decode(token) as any;
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

      // Check if staff with this CIN already exists but with a different ID
      const existingStaff = await prisma.staff.findUnique({
        where: { cin: staff.cin }
      });

      if (existingStaff && existingStaff.id !== staff.id) {
        // Delete the existing staff record to avoid unique constraint violation
        await prisma.session.deleteMany({
          where: { staffId: existingStaff.id }
        });
        
        await prisma.staff.delete({
          where: { id: existingStaff.id }
        });
        
        console.log(`⚠️ Removed conflicting staff record with CIN ${staff.cin} but different ID`);
      }

      // Store or update staff info locally
      await prisma.staff.upsert({
        where: { id: staff.id },
        update: {
          cin: staff.cin,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phoneNumber: staff.phoneNumber,
          role: staff.role,
          isActive: true,
          lastLogin: new Date(),
        },
        create: {
          id: staff.id,
          cin: staff.cin,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phoneNumber: staff.phoneNumber,
          role: staff.role,
          isActive: true,
          lastLogin: new Date(),
        }
      });

      // Deactivate old sessions for this staff
      await prisma.session.updateMany({
        where: { staffId: staff.id, isActive: true },
        data: { isActive: false }
      });

      // Create new session
      await prisma.session.create({
        data: {
          staffId: staff.id,
          token: token,
          staffData: JSON.stringify(staff),
          isActive: true,
          lastActivity: new Date(),
          expiresAt: expiresAt,
          createdOffline: false
        }
      });

      console.log(`💾 Session stored locally for staff: ${staff.firstName} ${staff.lastName}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Error storing session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Verify token against local database
   */
  private async verifyTokenLocally(token: string): Promise<{ valid: boolean; staff?: any; error?: string }> {
    try {
      // Find session in local database
      const session = await prisma.session.findUnique({
        where: { token },
        include: { staff: true }
      });

      if (!session || !session.isActive) {
        return { valid: false, error: 'Session not found or inactive' };
      }

      // Check if session is expired
      if (session.expiresAt && session.expiresAt < new Date()) {
        // Mark session as inactive
        await prisma.session.update({
          where: { id: session.id },
          data: { isActive: false }
        });
        
        return { valid: false, error: 'Session expired' };
      }

      // Check if staff is still active
      if (!session.staff.isActive) {
        return { valid: false, error: 'Staff account is deactivated' };
      }

      // Update last activity
      await prisma.session.update({
        where: { id: session.id },
        data: { lastActivity: new Date() }
      });

      // Parse staff data from session
      const staffData = JSON.parse(session.staffData);

      return {
        valid: true,
        staff: {
          id: session.staff.id,
          cin: session.staff.cin,
          firstName: session.staff.firstName,
          lastName: session.staff.lastName,
          role: session.staff.role,
          phoneNumber: session.staff.phoneNumber,
          ...staffData // Include any additional data from central server
        }
      };

    } catch (error) {
      console.error('❌ Local token verification error:', error);
      return { valid: false, error: 'Token verification failed' };
    }
  }

  /**
   * Logout staff (deactivate session) - Legacy method
   */
  async logoutLegacy(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const result = await prisma.session.updateMany({
        where: { token, isActive: true },
        data: { 
          isActive: false,
          lastActivity: new Date()
        }
      });

      if (result.count > 0) {
        console.log(`✅ Staff logged out successfully`);
        return { success: true, message: 'Logged out successfully' };
      }

      return { success: false, message: 'Session not found' };

    } catch (error) {
      console.error('❌ Logout error:', error);
      return { success: false, message: 'Failed to logout' };
    }
  }

  /**
   * Check if station is connected to central server
   */
  get   isConnectedToCentral(): boolean {
    return false; // Central server connection removed
  }

  /**
   * Create admin account (for initial setup) - CIN only authentication
   */
  async createAdmin(data: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    cin: string;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log(`🔐 Creating admin account for CIN: ${data.cin}`);

      // Check if CIN already exists
      const existingStaff = await prisma.staff.findUnique({
        where: { cin: data.cin }
      });

      if (existingStaff) {
        return {
          success: false,
          message: 'Staff member with this CIN already exists'
        };
      }

      // Check if there are any existing admins
      const existingAdmins = await prisma.staff.findMany({
        where: { role: 'ADMIN' }
      });

      if (existingAdmins.length > 0) {
        return {
          success: false,
          message: 'Admin account already exists. Only one admin is allowed.'
        };
      }

      // Generate unique ID
      const staffId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create admin (no password needed - CIN only authentication)
      const admin = await prisma.staff.create({
        data: {
          id: staffId,
          cin: data.cin,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          role: 'ADMIN',
          isActive: true
        }
      });

      console.log(`✅ Admin account created successfully: ${admin.firstName} ${admin.lastName}`);

      return {
        success: true,
        message: 'Admin account created successfully',
        data: {
          id: admin.id,
          cin: admin.cin,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role
        }
      };
    } catch (error) {
      console.error('❌ Admin creation error:', error);
      return {
        success: false,
        message: 'Failed to create admin account'
      };
    }
  }

  /**
   * Logout with Redis cleanup
   */
  async logout(token: string, cin: string): Promise<{ success: boolean; message: string }> {
    try {
      const redis = getRedisService();
      
      // Clean up Redis session data
      if (redis.getConnectionStatus()) {
        // Remove staff token
        await redis.deleteStaffToken(token);
        
        // Remove active session
        await redis.deleteSession(`${REDIS_KEYS.SESSION}active:${cin}`);
        
        // Remove from active staff set
        const staffData = await redis.getStaffToken(token);
        if (staffData) {
          await redis.srem(`${REDIS_KEYS.SESSION}active_staff`, staffData.id);
        }
        
        // Remove from active tokens set
        await redis.srem(`${REDIS_KEYS.SESSION}active_tokens`, token);
        
        console.log(`✅ Session cleaned up in Redis for CIN: ${cin}`);
      }

      // Clean up local database session
      await prisma.session.deleteMany({
        where: { token }
      });

      console.log(`✅ Logout successful for CIN: ${cin}`);

      return {
        success: true,
        message: 'Logout successful'
      };
    } catch (error) {
      console.error('❌ Logout error:', error);
      return {
        success: false,
        message: 'Logout failed'
      };
    }
  }

  /**
   * Get active sessions count from Redis
   */
  async getActiveSessionsCount(): Promise<number> {
    try {
      const redis = getRedisService();
      
      if (redis.getConnectionStatus()) {
        const activeStaff = await redis.smembers(`${REDIS_KEYS.SESSION}active_staff`);
        return activeStaff.length;
      }
      
      // Fallback to database count
      const count = await prisma.session.count();
      return count;
    } catch (error) {
      console.error('❌ Error getting active sessions count:', error);
      return 0;
    }
  }

  /**
   * Get connection status
   */
  get connectionStatus(): string {
    return 'disconnected'; // Central server connection removed
  }
}

// Export singleton instance
let authServiceInstance: LocalAuthService | null = null;

export const getAuthService = (): LocalAuthService => {
  if (!authServiceInstance) {
    authServiceInstance = new LocalAuthService();
  }
  return authServiceInstance;
}; 