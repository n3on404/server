import { Router, Request, Response } from 'express';
import { getAuthService } from '../services/authService';

const router = Router();

// WebSocket service removed - notifications handled via API polling

// WebSocket service removed - notifications handled via API polling
const initializeServices = () => {
  return getAuthService();
};

// Login with CIN and password
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { cin, password } = req.body;
    
    if (!cin || typeof cin !== 'string' || cin.length !== 8) {
      res.status(400).json({
        success: false,
        message: 'CIN must be exactly 8 digits',
        code: 'INVALID_CIN'
      });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        code: 'INVALID_PASSWORD'
      });
      return;
    }

    const authService = initializeServices();

    console.log(`🔐 Processing login request for CIN: ${cin}`);

    const result = await authService.login(cin, password);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'LOGIN_FAILED'
      });
      return;
    }

    res.json({
      success: true,
      message: result.message,
      token: result.token,
      staff: result.staff
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Change password
router.post('/change-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
        code: 'WEAK_PASSWORD'
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const authService = initializeServices();
    
    // Verify token first
    const tokenResult = await authService.verifyToken(token);
    if (!tokenResult.valid || !tokenResult.staff) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    // Change password
    const result = await authService.changePassword(tokenResult.staff.id, currentPassword, newPassword);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'PASSWORD_CHANGE_FAILED'
      });
      return;
    }

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Verify token (for middleware use) - GET endpoint for desktop app
router.get('/verify-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.query.token as string;
    
    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
        code: 'NO_TOKEN'
      });
      return;
    }

    const authService = initializeServices();
    const result = await authService.verifyToken(token);

    if (!result.valid) {
      res.status(401).json({
        success: false,
        message: result.error || 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Token is valid',
      staff: result.staff,
      source: result.source
    });
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Verify token (POST endpoint for compatibility)
router.post('/verify-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body.token;
    
    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
        code: 'NO_TOKEN'
      });
      return;
    }

    const authService = initializeServices();
    const result = await authService.verifyToken(token);

    if (!result.valid) {
      res.status(401).json({
        success: false,
        message: result.error || 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Token is valid',
      staff: result.staff,
      source: result.source
    });
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body.token;
    
    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
        code: 'NO_TOKEN'
      });
      return;
    }

    const authService = initializeServices();
    // For now, use the legacy logout method
    const result = await authService.logoutLegacy(token);

    res.json(result);
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Get connection status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const authService = initializeServices();
    
    res.json({
      success: true,
      connectionStatus: authService.connectionStatus,
      isConnectedToCentral: authService.isConnectedToCentral,
      websocketState: 'disconnected'
    });
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Create admin account (no auth required - for initial setup)
 * POST /api/auth/create-admin
 */
router.post('/create-admin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, phoneNumber, cin, password } = req.body;
    
    if (!firstName || !lastName || !phoneNumber || !cin || !password) {
      res.status(400).json({
        success: false,
        message: 'All fields are required',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    if (cin.length !== 8) {
      res.status(400).json({
        success: false,
        message: 'CIN must be exactly 8 digits',
        code: 'INVALID_CIN'
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        code: 'INVALID_PASSWORD'
      });
      return;
    }

    const authService = initializeServices();
    const result = await authService.createAdmin({
      firstName,
      lastName,
      phoneNumber,
      cin,
      password
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        code: 'ADMIN_CREATION_FAILED'
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      data: {
        id: result.data.id,
        cin: result.data.cin,
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        role: result.data.role
      }
    });
  } catch (error) {
    console.error('❌ Admin creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router; 