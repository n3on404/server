import { Router } from 'express';
import { authenticate, requireSupervisor } from '../middleware/auth';
import { getEventBusService } from '../services/eventBusService';
import { getDailyReport, getTodaySummary, getStaffDailyDetails, getActiveStaffToday } from '../services/supervisorReportService';
import { getAuthService } from '../services/authService';
import prisma from '../config/database';

const router = Router();

// Server-Sent Events endpoint for supervisor events
// simple in-memory logs (last 500)
const staffEventLog: any[] = [];
const vehicleEventLog: any[] = [];

async function enrichEvent(evt: any) {
  try {
    if (evt.table === 'operation_logs' || evt.type?.includes('staff')) {
      // operation log with staff
      const log = await prisma.operationLog.findUnique({ where: { id: Number(evt.id) }, include: { staff: true } }).catch(()=>null);
      if (log) {
        return { ...evt, staffId: log.staffId || log.staff?.id, staffName: log.staff ? `${log.staff.firstName} ${log.staff.lastName}`.trim() : undefined, operation: log.operation };
      }
    }
    if (evt.table === 'bookings' || evt.type === 'booking_created') {
      const b = await prisma.booking.findUnique({ where: { id: String(evt.id) }, include: { createdByStaff: true, queue: { include: { vehicle: true } } } }).catch(()=>null);
      if (b) {
        return { ...evt, staffId: b.createdBy, staffName: b.createdByStaff ? `${b.createdByStaff.firstName} ${b.createdByStaff.lastName}`.trim() : undefined, vehicleId: b.queue?.vehicleId, licensePlate: b.queue?.vehicle?.licensePlate };
      }
    }
    if (evt.table === 'vehicle_queue' || evt.type === 'queue_changed') {
      const vq = await prisma.vehicleQueue.findUnique({ where: { id: String(evt.id) }, include: { vehicle: true } }).catch(()=>null);
      if (vq) {
        return { ...evt, vehicleId: vq.vehicleId, licensePlate: vq.vehicle?.licensePlate, destinationName: vq.destinationName, status: vq.status };
      }
    }
    if (evt.table === 'trips' || evt.type === 'trip_started') {
      const t = await prisma.trip.findUnique({ where: { id: String(evt.id) }, include: { vehicle: true } }).catch(()=>null);
      if (t) {
        return { ...evt, vehicleId: t.vehicleId, licensePlate: t.vehicle?.licensePlate, destinationName: t.destinationName };
      }
    }
  } catch {}
  return evt;
}

router.get('/events', async (req, res) => {
  // Allow token via query param for EventSource (cannot send headers)
  try {
    const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : undefined;
    const token = (req.query.token as string) || tokenFromHeader;
    if (!token) {
      res.status(401).json({ success: false, message: 'No token' });
      return;
    }
    const auth = getAuthService();
    const result = await auth.verifyToken(token);
    if (!result.valid || !['SUPERVISOR','ADMIN'].includes(result.staff?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
  } catch (e) {
    res.status(401).json({ success: false, message: 'Auth error' });
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial hello
  send({ type: 'connected', ts: new Date().toISOString() });

  const bus = getEventBusService();
  const unsubscribe = bus.onEvent(async (evt) => {
    const enriched = await enrichEvent(evt);
    // persist minimal logs
    if (enriched.type?.includes('staff') || enriched.table === 'operation_logs' || enriched.type === 'booking_created' || enriched.type === 'day_pass_created') {
      staffEventLog.unshift({ ...enriched, ts: enriched.ts || new Date().toISOString() });
      if (staffEventLog.length > 500) staffEventLog.pop();
    }
    if (enriched.type === 'queue_changed' || enriched.type === 'trip_started' || enriched.table === 'vehicle_queue' || enriched.table === 'trips') {
      vehicleEventLog.unshift({ ...enriched, ts: enriched.ts || new Date().toISOString() });
      if (vehicleEventLog.length > 500) vehicleEventLog.pop();
    }
    send(enriched);
  });

  // Keep-alive ping (in case heartbeat disabled in bus)
  const ping = setInterval(() => send({ type: 'ping', ts: new Date().toISOString() }), 30000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  });
});

export default router;

// Daily report JSON
router.get('/report/daily', authenticate, requireSupervisor, async (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const report = await getDailyReport(date);
    res.json({ success: true, report });
  } catch (e) {
    console.error('Daily report error', e);
    res.status(500).json({ success: false, message: 'Report error' });
  }
});

// Dashboard summary (today)
router.get('/dashboard/summary', authenticate, requireSupervisor, async (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const summary = await getTodaySummary(date);
    res.json({ success: true, summary });
  } catch (e) {
    console.error('Dashboard summary error', e);
    res.status(500).json({ success: false, message: 'Summary error' });
  }
});

// Recent logs endpoints
router.get('/events/recent', authenticate, requireSupervisor, async (req, res) => {
  const type = String(req.query.type || 'all');
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'))));
  let data: any[] = [];
  if (type === 'staff') data = staffEventLog.slice(0, limit);
  else if (type === 'vehicle') data = vehicleEventLog.slice(0, limit);
  else data = [...staffEventLog.slice(0, Math.floor(limit/2)), ...vehicleEventLog.slice(0, Math.ceil(limit/2))];
  res.json({ success: true, data });
});

// Vehicle activity (last N hours, default 48)
router.get('/vehicles/:id/activity', authenticate, requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const hours = Math.max(1, Math.min(168, parseInt((req.query.hours as string) || '48')));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Fetch trips for this vehicle in the time window and enrich from vehicle_queue
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT t.id as trip_id,
             t.start_time,
             t.destination_id,
             t.destination_name,
             vq.id as queue_id,
             vq.entered_at,
             vq.actual_departure,
             vq.base_price,
             v.capacity as vehicle_capacity
      FROM trips t
      JOIN vehicle_queue vq ON vq.id = t.queue_id
      JOIN vehicles v ON v.id = t.vehicle_id
      WHERE t.vehicle_id = $1 AND t.start_time >= $2
      ORDER BY t.start_time DESC
      `,
      id,
      since
    );

    const activity = rows.map(r => ({
      tripId: r.trip_id,
      startTime: r.start_time,
      destinationId: r.destination_id,
      destinationName: r.destination_name,
      enteredAt: r.entered_at,
      departedAt: r.actual_departure,
      basePrice: Number(r.base_price || 0),
      capacity: Number(r.vehicle_capacity || 0),
      amount: Number(r.base_price || 0) * Number(r.vehicle_capacity || 0),
    }));

    res.json({ success: true, activity, since: since.toISOString(), hours });
  } catch (e) {
    console.error('Vehicle activity error', e);
    res.status(500).json({ success: false, message: 'Activity error' });
  }
});

// Printable HTML for daily report
router.get('/report/daily/print', async (req, res) => {
  try {
    // Accept token via query for print window
    const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : undefined;
    const token = (req.query.token as string) || tokenFromHeader;
    if (!token) {
      res.status(401).send('No token');
      return;
    }
    const auth = getAuthService();
    const result = await auth.verifyToken(token);
    if (!result.valid || !['SUPERVISOR','ADMIN'].includes(result.staff?.role)) {
      res.status(403).send('Forbidden');
      return;
    }
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const report = await getDailyReport(date);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Daily Report ${report.date}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
      h1 { margin: 0 0 16px; font-size: 20px; }
      h2 { margin: 16px 0 8px; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
      th { background: #f5f5f5; text-align: left; }
      .totals { margin-top: 16px; }
      @media print { body { margin: 0.6in; } }
    </style>
  </head>
  <body>
    <h1>Daily Report - ${report.date}</h1>

    <h2>Staff Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Staff</th>
          <th>CIN</th>
          <th>First Login</th>
          <th>Last Logout</th>
          <th>Seats</th>
          <th>Bookings Commission</th>
          <th>Day Pass Count</th>
          <th>Day Pass Commission</th>
          <th>Total Commission</th>
        </tr>
      </thead>
      <tbody>
        ${report.staffSummary.map(s => `
          <tr>
            <td>${[s.firstName || '', s.lastName || ''].join(' ').trim() || s.staffId}</td>
            <td>${s.cin || ''}</td>
            <td>${s.firstLogin || ''}</td>
            <td>${s.lastLogout || ''}</td>
            <td>${s.seatsBooked.toFixed(0)}</td>
            <td>${s.bookingsCommission.toFixed(3)}</td>
            <td>${s.dayPassCount.toFixed(0)}</td>
            <td>${s.dayPassCommission.toFixed(3)}</td>
            <td>${s.totalCommission.toFixed(3)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Vehicle Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Vehicle</th>
          <th>Bookings Total</th>
          <th>Day Pass Total</th>
          <th>Grand Total</th>
        </tr>
      </thead>
      <tbody>
        ${report.vehicleSummary.map(v => `
          <tr>
            <td>${v.licensePlate || v.vehicleId}</td>
            <td>${v.bookingsTotal.toFixed(3)}</td>
            <td>${v.dayPassTotal.toFixed(3)}</td>
            <td>${v.grandTotal.toFixed(3)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <strong>Seats Booked:</strong> ${report.totals.seatsBooked} | 
      <strong>Bookings Revenue:</strong> ${report.totals.bookingsRevenue.toFixed(3)} | 
      <strong>Day Pass Revenue:</strong> ${report.totals.dayPassRevenue.toFixed(3)} | 
      <strong>Grand Total:</strong> ${report.totals.grandTotal.toFixed(3)}
    </div>
    <script>window.onload = () => { if (window.matchMedia('print').matches) return; window.print(); };</script>
  </body>
</html>`);
  } catch (e) {
    console.error('Daily report print error', e);
    res.status(500).send('Report error');
  }
});

// Staff reports
router.get('/report/staff/daily', authenticate, requireSupervisor, async (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const staffId = req.query.staffId as string | undefined;
    const report = await getStaffDailyDetails(date, staffId);
    res.json({ success: true, report });
  } catch (e) {
    console.error('Staff daily report error', e);
    res.status(500).json({ success: false, message: 'Report error' });
  }
});

router.get('/report/staff/daily/print', async (req, res) => {
  try {
    const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : undefined;
    const token = (req.query.token as string) || tokenFromHeader;
    if (!token) { res.status(401).send('No token'); return; }
    const auth = getAuthService();
    const result = await auth.verifyToken(token);
    if (!result.valid || !['SUPERVISOR','ADMIN'].includes(result.staff?.role)) {
      res.status(403).send('Forbidden');
      return;
    }
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const staffId = req.query.staffId as string | undefined;
    // If no staffId, restrict to staff who worked today
    let r: any = await getStaffDailyDetails(date, staffId);
    if (!staffId) {
      const active = await getActiveStaffToday(date);
      const activeIds = new Set(active.map((x:any)=>x.id));
      r.staffSummary = (r.staffSummary||[]).filter((s:any)=>activeIds.has(s.staffId));
      r.details = (r.details||[]).filter((d:any)=>activeIds.has(d.staff_id));
      r.dayPassCounts = (r.dayPassCounts||[]).filter((x:any)=>activeIds.has(x.staff_id));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Staff Daily Report ${r.date}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px}h1{font-size:20px;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}th{background:#f5f5f5;text-align:left}</style>
</head><body>
<h1>Staff Daily Report - ${r.date}${staffId ? ' (Staff: ' + (r.staffSummary?.[0]?.firstName || '') + ' ' + (r.staffSummary?.[0]?.lastName || '') + ')' : ''}</h1>
<h2>Summary</h2>
<table><thead><tr><th>Staff</th><th>CIN</th><th>Seats</th><th>Bookings Comm.</th><th>Day Pass Count</th><th>Day Pass Comm.</th><th>Total Comm.</th></tr></thead>
<tbody>${(r.staffSummary||[]).map((s:any)=>`<tr><td>${[s.firstName||'',s.lastName||''].join(' ').trim()||s.staffId}</td><td>${s.cin||''}</td><td>${s.seatsBooked}</td><td>${s.bookingsCommission.toFixed(3)}</td><td>${s.dayPassCount}</td><td>${s.dayPassCommission.toFixed(3)}</td><td>${s.totalCommission.toFixed(3)}</td></tr>`).join('')}</tbody></table>

<h2>Details (Bookings)</h2>
<table><thead><tr><th>Staff</th><th>Destination</th><th>Vehicle</th><th>Seats</th><th>Amount</th></tr></thead>
<tbody>${(r.details||[]).map((d:any)=>`<tr><td>${[d.first_name||'',d.last_name||''].join(' ').trim()}</td><td>${d.destination_name||''}</td><td>${d.license_plate||''}</td><td>${d.seats}</td><td>${Number(d.amount||0).toFixed(3)}</td></tr>`).join('')}</tbody></table>

<h2>Day Passes</h2>
<table><thead><tr><th>Staff</th><th>Count</th><th>Commission</th></tr></thead>
<tbody>${(r.dayPassCounts||[]).map((x:any)=>`<tr><td>${x.staff_id}</td><td>${x.day_pass_count}</td><td>${(x.day_pass_count*2).toFixed(3)}</td></tr>`).join('')}</tbody></table>

<script>window.onload=()=>{window.print(); setTimeout(()=>window.close(), 500);};</script>
</body></html>`);
  } catch (e) {
    console.error('Staff daily report print error', e);
    res.status(500).send('Report error');
  }
});

