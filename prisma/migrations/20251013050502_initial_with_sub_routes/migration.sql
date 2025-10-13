-- CreateTable
CREATE TABLE "station_config" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "station_name" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "delegation" TEXT NOT NULL,
    "address" TEXT,
    "opening_time" TEXT NOT NULL DEFAULT '06:00',
    "closing_time" TEXT NOT NULL DEFAULT '22:00',
    "is_operational" BOOLEAN NOT NULL DEFAULT true,
    "service_fee" DECIMAL(10,3) NOT NULL DEFAULT 0.200,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "cin" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "staff_data" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_offline" BOOLEAN NOT NULL DEFAULT false,
    "last_offline_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "phone_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "default_destination_id" TEXT,
    "default_destination_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_authorized_stations" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "station_name" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_authorized_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_queue" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "destination_name" TEXT NOT NULL,
    "sub_route" TEXT,
    "sub_route_name" TEXT,
    "queueType" TEXT NOT NULL DEFAULT 'REGULAR',
    "queue_position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "entered_at" TIMESTAMP(3) NOT NULL,
    "available_seats" INTEGER NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "base_price" DOUBLE PRECISION NOT NULL,
    "estimated_departure" TIMESTAMP(3),
    "actual_departure" TIMESTAMP(3),

    CONSTRAINT "vehicle_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "station_name" TEXT NOT NULL,
    "base_price" DOUBLE PRECISION NOT NULL,
    "governorate" TEXT,
    "governorate_ar" TEXT,
    "delegation" TEXT,
    "delegation_ar" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_schedules" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "departure_time" TIMESTAMP(3) NOT NULL,
    "available_seats" INTEGER NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "actual_departure" TIMESTAMP(3),

    CONSTRAINT "vehicle_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "seats_booked" INTEGER NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "booking_source" TEXT NOT NULL DEFAULT 'CASH_STATION',
    "booking_type" TEXT NOT NULL DEFAULT 'CASH',
    "sub_route" TEXT,
    "sub_route_name" TEXT,
    "booking_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payment_status" TEXT NOT NULL DEFAULT 'PAID',
    "payment_method" TEXT NOT NULL DEFAULT 'CASH',
    "payment_processed_at" TIMESTAMP(3),
    "verification_code" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "refund_amount" DOUBLE PRECISION,
    "created_offline" BOOLEAN NOT NULL DEFAULT false,
    "local_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" SERIAL NOT NULL,
    "staff_id" TEXT,
    "operation" TEXT NOT NULL,
    "details" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "cin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "destination_name" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "seats_booked" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_passes" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_expired" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_passes" (
    "id" TEXT NOT NULL,
    "queue_id" TEXT,
    "vehicle_id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "destination_name" TEXT NOT NULL,
    "current_exit_time" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "station_config_station_id_key" ON "station_config"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_cin_key" ON "staff"("cin");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_license_plate_key" ON "vehicles"("license_plate");

-- CreateIndex
CREATE INDEX "vehicles_license_plate_idx" ON "vehicles"("license_plate");

-- CreateIndex
CREATE INDEX "vehicles_is_active_is_available_idx" ON "vehicles"("is_active", "is_available");

-- CreateIndex
CREATE INDEX "vehicles_is_banned_idx" ON "vehicles"("is_banned");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_authorized_stations_vehicle_id_station_id_key" ON "vehicle_authorized_stations"("vehicle_id", "station_id");

-- CreateIndex
CREATE INDEX "vehicle_queue_destination_id_queueType_status_idx" ON "vehicle_queue"("destination_id", "queueType", "status");

-- CreateIndex
CREATE INDEX "vehicle_queue_destination_id_sub_route_status_idx" ON "vehicle_queue"("destination_id", "sub_route", "status");

-- CreateIndex
CREATE INDEX "vehicle_queue_vehicle_id_idx" ON "vehicle_queue"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_queue_queue_position_idx" ON "vehicle_queue"("queue_position");

-- CreateIndex
CREATE INDEX "vehicle_queue_status_queueType_idx" ON "vehicle_queue"("status", "queueType");

-- CreateIndex
CREATE UNIQUE INDEX "routes_station_id_key" ON "routes"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_verification_code_key" ON "bookings"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_local_id_key" ON "bookings"("local_id");

-- CreateIndex
CREATE INDEX "bookings_queue_id_idx" ON "bookings"("queue_id");

-- CreateIndex
CREATE INDEX "bookings_verification_code_idx" ON "bookings"("verification_code");

-- CreateIndex
CREATE INDEX "bookings_created_by_idx" ON "bookings"("created_by");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- CreateIndex
CREATE INDEX "bookings_is_verified_idx" ON "bookings"("is_verified");

-- CreateIndex
CREATE INDEX "bookings_booking_status_idx" ON "bookings"("booking_status");

-- CreateIndex
CREATE INDEX "bookings_cancelled_at_idx" ON "bookings"("cancelled_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_authorized_stations" ADD CONSTRAINT "vehicle_authorized_stations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_queue" ADD CONSTRAINT "vehicle_queue_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "vehicle_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "vehicle_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_passes" ADD CONSTRAINT "day_passes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_passes" ADD CONSTRAINT "day_passes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_passes" ADD CONSTRAINT "exit_passes_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "vehicle_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_passes" ADD CONSTRAINT "exit_passes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_passes" ADD CONSTRAINT "exit_passes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
