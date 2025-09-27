import { Router } from 'express';
import bcrypt from 'bcrypt';
import { authenticate, requireSupervisor, requireCentralConnection } from '../middleware/auth';
import prisma from '../config/database';
import { randomUUID } from 'crypto';
import env from '../config/environment';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Helper function to broadcast staff updates (websocket functionality removed)
const broadcastStaffUpdate = (action: string, staffData: any) => {
  // WebSocket functionality removed - notifications handled via API polling
  console.log(`Staff update: ${action}`, staffData);
};

// NOTE: This router now uses real database records via Prisma (no mocks)

/**
 * Get all staff members for the station
 * GET /api/staff
 * Access: SUPERVISOR, ADMIN
 */
router.get('/', requireSupervisor, async (req, res) => {
  try {
    const { role, status } = req.query as { role?: string; status?: string };

    const where: any = {};
    if (role) where.role = role;
    if (status) where.isActive = status === 'active';

    const staff = await prisma.staff.findMany({
      where,
      orderBy: [{ lastLogin: 'desc' }, { firstName: 'asc' }],
    });

    res.json({
      success: true,
      data: staff,
      count: staff.length,
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get staff member by ID
 * GET /api/staff/:id
 * Access: SUPERVISOR, ADMIN
 */
router.get('/:id', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const staff = await prisma.staff.findUnique({ where: { id } });

    if (!staff) {
      res.status(404).json({
        success: false,
        message: 'Staff member not found',
      });
      return;
    }

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff member',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Create new staff member
 * POST /api/staff
 * Access: SUPERVISOR, ADMIN
 * - ADMIN can create SUPERVISOR and WORKER accounts
 * - SUPERVISOR can only create WORKER accounts
 */
router.post('/', requireSupervisor, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, cin, role = 'WORKER', password } = req.body as {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      cin?: string;
      role?: string;
      password?: string;
    };

    // Get the current user's role from the authenticated request
    const currentUserRole = req.staff?.role;
    
    // Role-based access control
    if (currentUserRole === 'SUPERVISOR' && role.toUpperCase() !== 'WORKER') {
      res.status(403).json({
        success: false,
        message: 'Supervisors can only create worker accounts',
      });
      return;
    }
    
    if (currentUserRole === 'ADMIN' && !['SUPERVISOR', 'WORKER'].includes(role.toUpperCase())) {
      res.status(400).json({
        success: false,
        message: 'Admin can only create supervisor or worker accounts',
      });
      return;
    }

    if (!firstName || !lastName || !phoneNumber || !cin) {
      res.status(400).json({
        success: false,
        message: 'First name, last name, phone number, and CIN are required',
      });
      return;
    }

    if (cin.length !== 8) {
      res.status(400).json({
        success: false,
        message: 'CIN must be exactly 8 digits',
      });
      return;
    }

    // Check if CIN already exists
    const existingStaff = await prisma.staff.findUnique({
      where: { cin }
    });

    if (existingStaff) {
      res.status(409).json({
        success: false,
        message: 'Staff member with this CIN already exists',
      });
      return;
    }

    // Generate a unique ID for the staff member
    const staffId = `staff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Hash the provided password or use CIN as default
    const passwordToUse = password || cin;
    const hashedPassword = await bcrypt.hash(passwordToUse, 12);

    // Create staff member locally
    const created = await prisma.staff.create({
      data: {
        id: staffId,
        cin,
        firstName,
        lastName,
        phoneNumber,
        password: hashedPassword,
        role: role.toUpperCase(),
        isActive: true
      }
    });

    broadcastStaffUpdate('created', created);

    res.status(201).json({
      success: true,
      data: created,
      message: 'Staff member created successfully',
    });
  } catch (error) {
    console.error('Error creating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create staff member',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Update staff member
 * PUT /api/staff/:id
 * Access: SUPERVISOR, ADMIN
 */
router.put('/:id', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phoneNumber, role, isActive } = req.body as {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      role?: string;
      isActive?: boolean;
    };

    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    const updated = await prisma.staff.update({
      where: { id },
      data: {
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        phoneNumber: phoneNumber ?? existing.phoneNumber,
        role: role ?? existing.role,
        isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
      },
    });

    broadcastStaffUpdate('updated', updated);

    res.json({
      success: true,
      data: updated,
      message: 'Staff member updated successfully',
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update staff member',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Toggle staff member status (freeze/unfreeze)
 * PATCH /api/staff/:id/toggle-status
 * Access: SUPERVISOR, ADMIN
 */
router.patch('/:id/toggle-status', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    const updated = await prisma.staff.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    broadcastStaffUpdate('status_toggled', updated);

    res.json({
      success: true,
      data: updated,
      message: `Staff member ${updated.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    console.error('Error toggling staff status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle staff status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Delete staff member
 * DELETE /api/staff/:id
 * Access: SUPERVISOR, ADMIN
 */
router.delete('/:id', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    try {
      await prisma.staff.delete({ where: { id } });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete staff member with existing linked records',
        error: err?.message || 'Delete failed',
      });
      return;
    }

    broadcastStaffUpdate('deleted', existing);

    res.json({
      success: true,
      message: 'Staff member deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff member',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router; 

/**
 * GET /api/staff/report/daily?date=YYYY-MM-DD
 * Returns daily report for all staff who have activity (bookings or day passes)
 */
router.get('/report/daily', requireSupervisor, async (req, res) => {
  try {
    const { date } = req.query as { date?: string };
    const target = date ? new Date(`${date}T00:00:00`) : new Date();
    const startOfDay = new Date(target); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);

    // Station config for service fee
    const stationConfig = await prisma.stationConfig.findFirst();
    const serviceFee = Number(stationConfig?.serviceFee || 0.200);

    // Fetch bookings grouped by staff (need seats to compute service fee)
    const bookings = await prisma.booking.findMany({
      where: { createdAt: { gte: startOfDay, lt: endOfDay }, createdBy: { not: null } },
      select: {
        id: true,
        createdBy: true,
        seatsBooked: true,
        createdAt: true,
        queue: {
          select: {
            destinationName: true,
            vehicle: {
              select: {
                licensePlate: true
              }
            }
          }
        }
      }
    });

    // Fetch day passes grouped by staff
    const dayPasses = await prisma.dayPass.findMany({
      where: { purchaseDate: { gte: startOfDay, lt: endOfDay } },
      select: { 
        id: true,
        createdBy: true, 
        price: true,
        licensePlate: true,
        purchaseDate: true
      }
    });

    // Collect staff IDs that have activity
    const activeStaffIds = new Set<string>();
    bookings.forEach(b => { if (b.createdBy) activeStaffIds.add(b.createdBy); });
    dayPasses.forEach(dp => { if (dp.createdBy) activeStaffIds.add(dp.createdBy); });

    if (activeStaffIds.size === 0) {
      res.json({ success: true, data: { date: `${startOfDay.getFullYear()}-${String(startOfDay.getMonth()+1).padStart(2,'0')}-${String(startOfDay.getDate()).padStart(2,'0')}`, staff: [] } });
      return;
    }

    const staffList = await prisma.staff.findMany({
      where: { id: { in: Array.from(activeStaffIds) } },
      select: { id: true, cin: true, firstName: true, lastName: true, role: true }
    });
    const staffMap = new Map(staffList.map(s => [s.id, s]));

    // Aggregate (service fees and day passes)
    const staffAgg = new Map<string, { 
      serviceFees: number; 
      dayPass: number; 
      income: number;
      totalBookings: number;
      totalSeatsBooked: number;
      totalDayPassesSold: number;
    }>();
    
    const ensure = (id: string) => {
      if (!staffAgg.has(id)) staffAgg.set(id, { 
        serviceFees: 0, 
        dayPass: 0, 
        income: 0,
        totalBookings: 0,
        totalSeatsBooked: 0,
        totalDayPassesSold: 0
      });
      return staffAgg.get(id)!;
    };

    // Process bookings - calculate service fees (0.200 TND per seat)
    bookings.forEach(b => {
      if (!b.createdBy) return;
      const agg = ensure(b.createdBy);
      const seats = Number(b.seatsBooked || 0);
      const serviceFeeAmount = seats * 0.200; // Fixed 0.200 TND per seat
      
      agg.serviceFees += serviceFeeAmount;
      agg.income += serviceFeeAmount;
      agg.totalBookings += 1;
      agg.totalSeatsBooked += seats;
    });

    // Process day passes - each day pass is 2 TND
    dayPasses.forEach(dp => {
      if (!dp.createdBy) return;
      const agg = ensure(dp.createdBy);
      const dayPassAmount = 2; // Fixed 2 TND per day pass
      
      agg.dayPass += dayPassAmount;
      agg.income += dayPassAmount;
      agg.totalDayPassesSold += 1;
    });

    const result = Array.from(staffAgg.entries()).map(([id, agg]) => {
      const s = staffMap.get(id)!;
      return {
        staff: { 
          id: s.id, 
          cin: s.cin, 
          firstName: s.firstName, 
          lastName: s.lastName, 
          role: s.role 
        },
        totals: { 
          serviceFees: agg.serviceFees, 
          dayPass: agg.dayPass, 
          income: agg.income, 
          serviceFeeRate: 0.200 // Fixed service fee rate
        },
        summary: {
          totalBookings: agg.totalBookings,
          totalSeatsBooked: agg.totalSeatsBooked,
          totalDayPassesSold: agg.totalDayPassesSold,
          averageServiceFeePerSeat: agg.totalSeatsBooked > 0 ? agg.serviceFees / agg.totalSeatsBooked : 0
        }
      };
    });

    res.json({ success: true, data: { date: `${startOfDay.getFullYear()}-${String(startOfDay.getMonth()+1).padStart(2,'0')}-${String(startOfDay.getDate()).padStart(2,'0')}`, staff: result } });
  } catch (error: any) {
    console.error('Error fetching staff daily report:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch staff daily report', error: error?.message || 'Unknown error' });
  }
});
/**
 * Get staff transactions and totals (for a specific day)
 * GET /api/staff/:id/transactions?date=YYYY-MM-DD
 * Access: SUPERVISOR, ADMIN
 */
router.get('/:id/transactions', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query as { date?: string };

    // Verify staff exists
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    // Compute day range
    const target = date ? (() => { const [y,m,d] = date.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0); })() : new Date();
    const startOfDay = new Date(target);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // Get station config for service fee calculation
    const stationConfig = await prisma.stationConfig.findFirst();
    const serviceFee = Number(stationConfig?.serviceFee || 0.200);

    // Bookings created by staff with detailed breakdown
    const bookings = await prisma.booking.findMany({
      where: {
        createdBy: id,
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
      select: {
        id: true,
        seatsBooked: true,
        totalAmount: true,
        createdAt: true,
        bookingType: true,
        bookingSource: true,
        paymentMethod: true,
        verificationCode: true,
        queue: { 
          select: { 
            destinationName: true,
            basePrice: true,
            vehicle: {
              select: {
                licensePlate: true
              }
            }
          } 
        },
      },
      orderBy: { createdAt: 'asc' }, // Order by time for timeline
    });

    // Day passes sold by staff
    const dayPasses = await prisma.dayPass.findMany({
      where: {
        purchaseDate: { gte: startOfDay, lt: endOfDay },
        createdBy: id,
      },
      select: {
        id: true,
        licensePlate: true,
        price: true,
        purchaseDate: true,
      },
      orderBy: { purchaseDate: 'asc' }, // Order by time for timeline
    });

    // Calculate detailed breakdown for each booking (focus on service fees only)
    const enhancedBookings = bookings.map(booking => {
      const seatsBooked = booking.seatsBooked;
      const serviceFeeAmount = seatsBooked * 0.200; // Fixed 0.200 TND per seat

      return {
        ...booking,
        serviceFee: 0.200,
        serviceFeeAmount,
        vehicleLicensePlate: booking.queue?.vehicle?.licensePlate || 'N/A',
        destinationName: booking.queue?.destinationName || 'N/A'
      };
    });

    // Calculate totals (only service fees and day passes)
    const totalServiceFees = enhancedBookings.reduce((sum, b) => sum + (b.serviceFeeAmount || 0), 0);
    const totalDayPasses = dayPasses.length * 2; // Fixed 2 TND per day pass
    const totalIncome = totalServiceFees + totalDayPasses;

    // Calculate work timeline
    const allTransactions = [
      ...enhancedBookings.map(b => ({ type: 'booking', time: b.createdAt, amount: b.serviceFeeAmount, serviceFee: b.serviceFeeAmount })),
      ...dayPasses.map(d => ({ type: 'daypass', time: d.purchaseDate, amount: 2, serviceFee: 0 })) // Fixed 2 TND per day pass
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const workStartTime = allTransactions.length > 0 ? allTransactions[0].time : null;
    const workEndTime = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1].time : null;

    // Calculate work duration
    let workDuration = null;
    if (workStartTime && workEndTime) {
      const start = new Date(workStartTime);
      const end = new Date(workEndTime);
      const diffMs = end.getTime() - start.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      workDuration = `${hours}h ${minutes}m`;
    }

    res.json({
      success: true,
      data: {
        staff: { 
          id: staff.id, 
          cin: staff.cin, 
          firstName: staff.firstName, 
          lastName: staff.lastName, 
          role: staff.role 
        },
        date: startOfDay.toISOString().slice(0, 10),
        workTimeline: {
          startTime: workStartTime,
          endTime: workEndTime,
          duration: workDuration,
          totalTransactions: allTransactions.length
        },
        totals: {
          totalServiceFees,
          totalDayPasses,
          totalIncome,
          serviceFeeRate: 0.200 // Fixed service fee rate
        },
        items: {
          bookings: enhancedBookings,
          dayPasses,
        },
        summary: {
          totalSeatsBooked: enhancedBookings.reduce((sum, b) => sum + b.seatsBooked, 0),
          totalDayPassesSold: dayPasses.length,
          averageServiceFeePerSeat: enhancedBookings.length > 0 ? 
            totalServiceFees / enhancedBookings.reduce((sum, b) => sum + b.seatsBooked, 0) : 0
        }
      },
    });
  } catch (error: any) {
    console.error('Error fetching staff transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch staff transactions', error: error?.message || 'Unknown error' });
  }
});

/**
 * Get current staff information from the session
 */
router.get('/current', async (req: any, res) => {
  try {
    // Get staff ID from the authenticated request
    const staffId = req.staff?.id;
    
    if (!staffId) {
      return res.status(401).json({ 
        success: false, 
        message: 'No staff session found' 
      });
    }

    // Fetch staff information from database
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        cin: true,
        firstName: true,
        lastName: true,
        role: true,
        phoneNumber: true,
        isActive: true,
      }
    });

    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: 'Staff not found' 
      });
    }

    if (!staff.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Staff account is inactive' 
      });
    }

    return res.json({
      success: true,
      data: staff
    });

  } catch (error: any) {
    console.error('Error fetching current staff:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch current staff', 
      error: error?.message || 'Unknown error' 
    });
  }
});