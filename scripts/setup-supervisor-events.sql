-- Create function and triggers to emit compact NOTIFY payloads on key tables

CREATE OR REPLACE FUNCTION emit_supervisor_event()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  event_type TEXT;
  now_ts TIMESTAMPTZ := now();
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_type := COALESCE(TG_ARGV[0], 'row_inserted');
  ELSIF TG_OP = 'UPDATE' THEN
    event_type := COALESCE(TG_ARGV[1], 'row_updated');
  ELSE
    RETURN NULL;
  END IF;

  payload := json_build_object(
    'type', event_type,
    'ts', now_ts,
    'table', TG_TABLE_NAME,
    'id', NEW.id
  );

  PERFORM pg_notify('supervisor_events', payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers idempotently

-- operation_logs
DROP TRIGGER IF EXISTS trg_ops_logs_notify ON operation_logs;
CREATE TRIGGER trg_ops_logs_notify
AFTER INSERT OR UPDATE ON operation_logs
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('staff_event','staff_event_update');

-- bookings
DROP TRIGGER IF EXISTS trg_bookings_notify ON bookings;
CREATE TRIGGER trg_bookings_notify
AFTER INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('booking_created','booking_updated');

-- day_passes
DROP TRIGGER IF EXISTS trg_day_pass_notify ON day_passes;
CREATE TRIGGER trg_day_pass_notify
AFTER INSERT OR UPDATE ON day_passes
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('day_pass_created','day_pass_updated');

-- exit_passes
DROP TRIGGER IF EXISTS trg_exit_pass_notify ON exit_passes;
CREATE TRIGGER trg_exit_pass_notify
AFTER INSERT OR UPDATE ON exit_passes
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('exit_pass_created','exit_pass_updated');

-- sessions
DROP TRIGGER IF EXISTS trg_sessions_notify ON sessions;
CREATE TRIGGER trg_sessions_notify
AFTER INSERT OR UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('session_changed','session_changed');

-- vehicle_queue
DROP TRIGGER IF EXISTS trg_vehicle_queue_notify ON vehicle_queue;
CREATE TRIGGER trg_vehicle_queue_notify
AFTER INSERT OR UPDATE ON vehicle_queue
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('queue_changed','queue_changed');

-- trips
DROP TRIGGER IF EXISTS trg_trips_notify ON trips;
CREATE TRIGGER trg_trips_notify
AFTER INSERT OR UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION emit_supervisor_event('trip_started','trip_updated');

