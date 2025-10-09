import prisma from '../config/database';
import { startOfDay, endOfDay } from 'date-fns';

export type StaffSummary = {
  staffId: string;
  cin?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  firstLogin?: string | null;
  lastLogout?: string | null;
  seatsBooked: number;
  bookingsCommission: number;
  dayPassCount: number;
  dayPassCommission: number;
  totalCommission: number;
};

export type VehicleSummary = {
  vehicleId: string;
  licensePlate: string | null;
  bookingsTotal: number;
  dayPassTotal: number;
  grandTotal: number;
};

export type DailyReport = {
  date: string;
  staffSummary: StaffSummary[];
  vehicleSummary: VehicleSummary[];
  totals: {
    seatsBooked: number;
    bookingsRevenue: number;
    dayPassRevenue: number;
    staffCommission: number;
    grandTotal: number;
  };
};

export async function getDailyReport(dateISO: string): Promise<DailyReport> {
  const day = new Date(dateISO);
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  // Trust the provided date string (YYYY-MM-DD) to avoid UTC offset shifting
  const dayDate = dateISO;
  const tz = 'Africa/Tunis';

  // Staff commission from bookings (0.2 per seat)
  const staffBookings = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT b.created_by AS staff_id,
           SUM(b.seats_booked)::int AS seats_booked,
           (SUM(b.seats_booked) * 0.200)::float AS commission
    FROM bookings b
    WHERE (b.created_at AT TIME ZONE $2)::date = $1::date AND b.created_by IS NOT NULL
    GROUP BY b.created_by
    `,
    dayDate,
    tz
  );

  // Staff commission from day passes (2 TND each)
  const staffDayPass = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT d.created_by AS staff_id,
           COUNT(*)::int AS count,
           (COUNT(*) * 2.000)::float AS commission
    FROM day_passes d
    WHERE (d.created_at AT TIME ZONE $2)::date = $1::date
    GROUP BY d.created_by
    `,
    dayDate,
    tz
  );

  // Staff basic info and sessions window (first login, last activity)
  const staffInfo = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT s.id AS staff_id,
           s.cin,
           s.first_name,
           s.last_name,
           MIN(se.created_at) FILTER (WHERE se.is_active = true) AS first_login,
           MAX(se.last_activity) AS last_logout
    FROM staff s
    LEFT JOIN sessions se ON se.staff_id = s.id AND (se.created_at AT TIME ZONE $2)::date = $1::date
    WHERE s.role IN ('WORKER','SUPERVISOR','ADMIN')
    GROUP BY s.id, s.cin, s.first_name, s.last_name
    `,
    dayDate,
    tz
  );

  // Vehicle revenue from bookings (sum total_amount) and day passes (sum price)
  const vehicleBookings = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT vq.vehicle_id AS vehicle_id,
           v.license_plate AS license_plate,
           COALESCE(SUM(b.total_amount), 0)::float AS revenue
    FROM vehicle_queue vq
    JOIN vehicles v ON v.id = vq.vehicle_id
    LEFT JOIN bookings b ON b.queue_id = vq.id AND (b.created_at AT TIME ZONE $2)::date = $1::date
    GROUP BY vq.vehicle_id, v.license_plate
    `,
    dayDate,
    tz
  );

  const vehicleDayPass = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT d.vehicle_id AS vehicle_id,
           MAX(v.license_plate) AS license_plate,
           COALESCE(SUM(d.price), 0)::float AS revenue
    FROM day_passes d
    LEFT JOIN vehicles v ON v.id = d.vehicle_id
    WHERE (d.created_at AT TIME ZONE $2)::date = $1::date
    GROUP BY d.vehicle_id
    `,
    dayDate,
    tz
  );

  // Merge staff summaries
  const staffMap = new Map<string, StaffSummary>();
  for (const s of staffInfo) {
    staffMap.set(s.staff_id, {
      staffId: s.staff_id,
      cin: s.cin,
      firstName: s.first_name,
      lastName: s.last_name,
      firstLogin: s.first_login ? new Date(s.first_login).toISOString() : null,
      lastLogout: s.last_logout ? new Date(s.last_logout).toISOString() : null,
      seatsBooked: 0,
      bookingsCommission: 0,
      dayPassCount: 0,
      dayPassCommission: 0,
      totalCommission: 0,
    });
  }
  for (const sb of staffBookings) {
    const row = staffMap.get(sb.staff_id) || {
      staffId: sb.staff_id,
      cin: null,
      firstName: null,
      lastName: null,
      firstLogin: null,
      lastLogout: null,
      seatsBooked: 0,
      bookingsCommission: 0,
      dayPassCount: 0,
      dayPassCommission: 0,
      totalCommission: 0,
    } as StaffSummary;
    row.seatsBooked = Number(sb.seats_booked || 0);
    row.bookingsCommission = Number(sb.commission || 0);
    row.totalCommission = row.bookingsCommission + row.dayPassCommission;
    staffMap.set(sb.staff_id, row);
  }
  for (const sd of staffDayPass) {
    const row = staffMap.get(sd.staff_id) || {
      staffId: sd.staff_id,
      cin: null,
      firstName: null,
      lastName: null,
      firstLogin: null,
      lastLogout: null,
      seatsBooked: 0,
      bookingsCommission: 0,
      dayPassCount: 0,
      dayPassCommission: 0,
      totalCommission: 0,
    } as StaffSummary;
    row.dayPassCount = Number(sd.count || 0);
    row.dayPassCommission = Number(sd.commission || 0);
    row.totalCommission = (row.bookingsCommission || 0) + (row.dayPassCommission || 0);
    staffMap.set(sd.staff_id, row);
  }

  // Filter out staff who had no activity (0 seats and 0 day passes)
  const staffSummaryAll = Array.from(staffMap.values());
  const staffSummary = staffSummaryAll
    .filter(s => (Number(s.seatsBooked || 0) > 0) || (Number(s.dayPassCount || 0) > 0))
    .sort((a, b) => (b.totalCommission - a.totalCommission));

  // Merge vehicle summaries
  const vehicleMap = new Map<string, VehicleSummary>();
  for (const vb of vehicleBookings) {
    vehicleMap.set(vb.vehicle_id, {
      vehicleId: vb.vehicle_id,
      licensePlate: vb.license_plate || null,
      bookingsTotal: Number(vb.revenue || 0),
      dayPassTotal: 0,
      grandTotal: Number(vb.revenue || 0),
    });
  }
  for (const vd of vehicleDayPass) {
    const row = vehicleMap.get(vd.vehicle_id) || {
      vehicleId: vd.vehicle_id,
      licensePlate: vd.license_plate || null,
      bookingsTotal: 0,
      dayPassTotal: 0,
      grandTotal: 0,
    } as VehicleSummary;
    row.dayPassTotal = Number(vd.revenue || 0);
    row.grandTotal = (row.bookingsTotal || 0) + (row.dayPassTotal || 0);
    vehicleMap.set(vd.vehicle_id, row);
  }
  // Filter out vehicles with no revenue today
  const vehicleSummary = Array.from(vehicleMap.values())
    .filter(v => Number(v.bookingsTotal || 0) > 0 || Number(v.dayPassTotal || 0) > 0)
    .sort((a, b) => (b.grandTotal - a.grandTotal));

  // Totals
  const seatsBooked = staffSummary.reduce((s, x) => s + (x.seatsBooked || 0), 0);
  const staffCommission = staffSummary.reduce((s, x) => s + (x.totalCommission || 0), 0);
  const bookingsRevenue = vehicleSummary.reduce((s, x) => s + (x.bookingsTotal || 0), 0);
  const dayPassRevenue = vehicleSummary.reduce((s, x) => s + (x.dayPassTotal || 0), 0);

  return {
    date: dayDate,
    staffSummary,
    vehicleSummary,
    totals: {
      seatsBooked,
      bookingsRevenue,
      dayPassRevenue,
      staffCommission,
      grandTotal: bookingsRevenue + dayPassRevenue,
    },
  };
}

export type TodaySummary = {
  date: string;
  bookings: {
    count: number;
    seats: number;
    revenue: number;
  };
  dayPasses: {
    count: number;
    revenue: number;
  };
  totals: {
    transactions: number; // bookings + day passes
    revenue: number;
    commissionEstimate: number; // seats * 0.2 + dayPassCount * 2
  };
  inventory: {
    vehiclesActive: number;
    staffActive: number;
  };
};

export async function getTodaySummary(dateISO?: string): Promise<TodaySummary> {
  const day = dateISO ? new Date(dateISO) : new Date();
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const [bookAgg] = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(seats_booked),0)::int AS seats,
           COALESCE(SUM(total_amount),0)::float AS revenue
    FROM bookings
    WHERE created_at >= $1 AND created_at <= $2
    `,
    dayStart,
    dayEnd
  );

  const [dpAgg] = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(price),0)::float AS revenue
    FROM day_passes
    WHERE created_at >= $1 AND created_at <= $2
    `,
    dayStart,
    dayEnd
  );

  const [vehAgg] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS count FROM vehicles WHERE is_active = true`
  );

  const [staffAgg] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS count FROM staff WHERE is_active = true`
  );

  const bookings = {
    count: Number(bookAgg?.count || 0),
    seats: Number(bookAgg?.seats || 0),
    revenue: Number(bookAgg?.revenue || 0),
  };
  const dayPasses = {
    count: Number(dpAgg?.count || 0),
    revenue: Number(dpAgg?.revenue || 0),
  };
  const transactions = bookings.count + dayPasses.count;
  const commissionEstimate = bookings.seats * 0.2 + dayPasses.count * 2.0;
  const revenue = bookings.revenue + dayPasses.revenue;

  return {
    date: dayStart.toISOString().slice(0, 10),
    bookings,
    dayPasses,
    totals: { transactions, revenue, commissionEstimate },
    inventory: {
      vehiclesActive: Number(vehAgg?.count || 0),
      staffActive: Number(staffAgg?.count || 0),
    },
  };
}

export async function getStaffDailyDetails(dateISO: string, staffId?: string) {
  const day = new Date(dateISO);
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  // Summary reuse
  const daily = await getDailyReport(dateISO);

  // Detailed lines for bookings per staff (destination, vehicle, seats, amount)
  const details = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT b.created_by AS staff_id,
           s.first_name, s.last_name, s.cin,
           vq.destination_name,
           v.license_plate,
           SUM(b.seats_booked)::int AS seats,
           SUM(b.total_amount)::float AS amount
    FROM bookings b
    JOIN vehicle_queue vq ON vq.id = b.queue_id
    LEFT JOIN vehicles v ON v.id = vq.vehicle_id
    LEFT JOIN staff s ON s.id = b.created_by
    WHERE b.created_at >= $1 AND b.created_at <= $2
      ${staffId ? 'AND b.created_by = $3' : ''}
    GROUP BY b.created_by, s.first_name, s.last_name, s.cin, vq.destination_name, v.license_plate
    ORDER BY s.first_name, s.last_name, vq.destination_name, v.license_plate
    `,
    ...(staffId ? [dayStart, dayEnd, staffId] : [dayStart, dayEnd])
  );

  // Day pass counts per staff
  const dpp = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT created_by AS staff_id, COUNT(*)::int AS day_pass_count
    FROM day_passes
    WHERE created_at >= $1 AND created_at <= $2
      ${staffId ? 'AND created_by = $3' : ''}
    GROUP BY created_by
    `,
    ...(staffId ? [dayStart, dayEnd, staffId] : [dayStart, dayEnd])
  );

  return {
    date: daily.date,
    staffSummary: staffId ? daily.staffSummary.filter(s => s.staffId === staffId) : daily.staffSummary,
    details,
    dayPassCounts: dpp,
    totals: daily.totals,
  };
}

export async function getActiveStaffToday(dateISO?: string) {
  const day = dateISO ? new Date(dateISO) : new Date();
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH active_staff AS (
      SELECT DISTINCT b.created_by AS staff_id
      FROM bookings b
      WHERE b.created_at >= $1 AND b.created_at <= $2 AND b.created_by IS NOT NULL
      UNION
      SELECT DISTINCT d.created_by AS staff_id
      FROM day_passes d
      WHERE d.created_at >= $1 AND d.created_at <= $2 AND d.created_by IS NOT NULL
      UNION
      SELECT DISTINCT se.staff_id
      FROM sessions se
      WHERE se.last_activity >= $1 AND se.last_activity <= $2 AND se.staff_id IS NOT NULL
    )
    SELECT s.*
    FROM staff s
    JOIN active_staff a ON a.staff_id = s.id
    ORDER BY s.first_name, s.last_name
    `,
    dayStart,
    dayEnd
  );

  return rows;
}

