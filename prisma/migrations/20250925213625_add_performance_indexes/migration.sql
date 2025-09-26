/*
  Warnings:

  - You are about to drop the column `departure_station_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `destination_station_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `estimated_arrival_time` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `journey_date` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `online_ticket_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `payment_reference` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to alter the column `total_amount` on the `bookings` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - You are about to drop the column `driver_id` on the `day_passes` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `departure_station_id` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `destination_station_id` on the `routes` table. All the data in the column will be lost.
  - You are about to alter the column `base_price` on the `routes` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - You are about to drop the column `created_at` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `station_id` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `is_online` on the `station_config` table. All the data in the column will be lost.
  - You are about to drop the column `last_sync` on the `station_config` table. All the data in the column will be lost.
  - You are about to drop the column `server_version` on the `station_config` table. All the data in the column will be lost.
  - You are about to drop the column `departure_station_id` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `destination_station_id` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `vehicle_queue` table. All the data in the column will be lost.
  - You are about to drop the column `station_id` on the `vehicle_queue` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `vehicle_queue` table. All the data in the column will be lost.
  - You are about to alter the column `base_price` on the `vehicle_queue` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - The `queueType` column on the `vehicle_queue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `vehicle_queue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `synced_at` on the `vehicle_schedules` table. All the data in the column will be lost.
  - You are about to drop the `delegations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `driver_entry_tickets` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `driver_exit_tickets` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `drivers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `governorates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `stations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sync_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sync_queue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[local_id]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[station_id]` on the table `routes` will be added. If there are existing duplicate values, this will fail.
  - Made the column `queue_id` on table `bookings` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `station_id` to the `routes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `station_name` to the `routes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `routes` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `role` on the `staff` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_departure_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_destination_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_queue_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."day_passes" DROP CONSTRAINT "day_passes_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."delegations" DROP CONSTRAINT "delegations_governorate_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."driver_entry_tickets" DROP CONSTRAINT "driver_entry_tickets_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."driver_entry_tickets" DROP CONSTRAINT "driver_entry_tickets_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."driver_exit_tickets" DROP CONSTRAINT "driver_exit_tickets_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."driver_exit_tickets" DROP CONSTRAINT "driver_exit_tickets_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."drivers" DROP CONSTRAINT "drivers_approved_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."drivers" DROP CONSTRAINT "drivers_assigned_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."drivers" DROP CONSTRAINT "drivers_origin_delegation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."drivers" DROP CONSTRAINT "drivers_origin_governorate_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."drivers" DROP CONSTRAINT "drivers_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."operation_logs" DROP CONSTRAINT "operation_logs_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."routes" DROP CONSTRAINT "routes_departure_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."routes" DROP CONSTRAINT "routes_destination_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."staff" DROP CONSTRAINT "staff_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."stations" DROP CONSTRAINT "stations_delegation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."stations" DROP CONSTRAINT "stations_governorate_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."stations" DROP CONSTRAINT "stations_supervisor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."sync_logs" DROP CONSTRAINT "sync_logs_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."trips" DROP CONSTRAINT "trips_departure_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."trips" DROP CONSTRAINT "trips_destination_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."trips" DROP CONSTRAINT "trips_queue_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."vehicle_authorized_stations" DROP CONSTRAINT "vehicle_authorized_stations_station_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."vehicle_queue" DROP CONSTRAINT "vehicle_queue_destination_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."vehicle_queue" DROP CONSTRAINT "vehicle_queue_station_id_fkey";

-- DropIndex
DROP INDEX "public"."bookings_online_ticket_id_key";

-- DropIndex
DROP INDEX "public"."bookings_payment_reference_key";

-- DropIndex
DROP INDEX "public"."vehicle_queue_station_id_destination_id_queue_position_key";

-- AlterTable
ALTER TABLE "public"."bookings" DROP COLUMN "departure_station_id",
DROP COLUMN "destination_station_id",
DROP COLUMN "estimated_arrival_time",
DROP COLUMN "journey_date",
DROP COLUMN "online_ticket_id",
DROP COLUMN "payment_reference",
DROP COLUMN "status",
DROP COLUMN "updated_at",
DROP COLUMN "user_id",
ADD COLUMN     "created_offline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "local_id" TEXT,
ALTER COLUMN "queue_id" SET NOT NULL,
ALTER COLUMN "total_amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "booking_source" SET DEFAULT 'CASH_STATION',
ALTER COLUMN "payment_status" SET DEFAULT 'PAID';

-- AlterTable
ALTER TABLE "public"."day_passes" DROP COLUMN "driver_id";

-- AlterTable
ALTER TABLE "public"."operation_logs" ALTER COLUMN "staff_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."routes" DROP COLUMN "created_at",
DROP COLUMN "departure_station_id",
DROP COLUMN "destination_station_id",
ADD COLUMN     "delegation" TEXT,
ADD COLUMN     "delegation_ar" TEXT,
ADD COLUMN     "governorate" TEXT,
ADD COLUMN     "governorate_ar" TEXT,
ADD COLUMN     "station_id" TEXT NOT NULL,
ADD COLUMN     "station_name" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "base_price" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."staff" DROP COLUMN "created_at",
DROP COLUMN "created_by",
DROP COLUMN "station_id",
DROP COLUMN "synced_at",
DROP COLUMN "updated_at",
DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."station_config" DROP COLUMN "is_online",
DROP COLUMN "last_sync",
DROP COLUMN "server_version";

-- AlterTable
ALTER TABLE "public"."trips" DROP COLUMN "departure_station_id",
DROP COLUMN "destination_station_id",
ALTER COLUMN "start_time" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."vehicle_authorized_stations" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "station_name" TEXT;

-- AlterTable
ALTER TABLE "public"."vehicle_queue" DROP COLUMN "created_at",
DROP COLUMN "station_id",
DROP COLUMN "updated_at",
ALTER COLUMN "entered_at" DROP DEFAULT,
ALTER COLUMN "base_price" SET DATA TYPE DOUBLE PRECISION,
DROP COLUMN "queueType",
ADD COLUMN     "queueType" TEXT NOT NULL DEFAULT 'REGULAR',
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'WAITING';

-- AlterTable
ALTER TABLE "public"."vehicle_schedules" DROP COLUMN "synced_at";

-- AlterTable
ALTER TABLE "public"."vehicles" ADD COLUMN     "default_destination_id" TEXT,
ADD COLUMN     "default_destination_name" TEXT,
ALTER COLUMN "is_active" SET DEFAULT true;

-- DropTable
DROP TABLE "public"."delegations";

-- DropTable
DROP TABLE "public"."driver_entry_tickets";

-- DropTable
DROP TABLE "public"."driver_exit_tickets";

-- DropTable
DROP TABLE "public"."drivers";

-- DropTable
DROP TABLE "public"."governorates";

-- DropTable
DROP TABLE "public"."stations";

-- DropTable
DROP TABLE "public"."sync_logs";

-- DropTable
DROP TABLE "public"."sync_queue";

-- DropTable
DROP TABLE "public"."users";

-- DropEnum
DROP TYPE "public"."BookingStatus";

-- DropEnum
DROP TYPE "public"."DriverStatus";

-- DropEnum
DROP TYPE "public"."QueueStatus";

-- DropEnum
DROP TYPE "public"."QueueType";

-- DropEnum
DROP TYPE "public"."StaffRole";

-- DropEnum
DROP TYPE "public"."SyncOperation";

-- DropEnum
DROP TYPE "public"."SyncStatus";

-- CreateIndex
CREATE UNIQUE INDEX "bookings_local_id_key" ON "public"."bookings"("local_id");

-- CreateIndex
CREATE INDEX "bookings_queue_id_idx" ON "public"."bookings"("queue_id");

-- CreateIndex
CREATE INDEX "bookings_verification_code_idx" ON "public"."bookings"("verification_code");

-- CreateIndex
CREATE INDEX "bookings_created_by_idx" ON "public"."bookings"("created_by");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "public"."bookings"("created_at");

-- CreateIndex
CREATE INDEX "bookings_is_verified_idx" ON "public"."bookings"("is_verified");

-- CreateIndex
CREATE UNIQUE INDEX "routes_station_id_key" ON "public"."routes"("station_id");

-- CreateIndex
CREATE INDEX "vehicle_queue_destination_id_queueType_status_idx" ON "public"."vehicle_queue"("destination_id", "queueType", "status");

-- CreateIndex
CREATE INDEX "vehicle_queue_vehicle_id_idx" ON "public"."vehicle_queue"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_queue_queue_position_idx" ON "public"."vehicle_queue"("queue_position");

-- CreateIndex
CREATE INDEX "vehicle_queue_status_queueType_idx" ON "public"."vehicle_queue"("status", "queueType");

-- CreateIndex
CREATE INDEX "vehicles_license_plate_idx" ON "public"."vehicles"("license_plate");

-- CreateIndex
CREATE INDEX "vehicles_is_active_is_available_idx" ON "public"."vehicles"("is_active", "is_available");

-- CreateIndex
CREATE INDEX "vehicles_is_banned_idx" ON "public"."vehicles"("is_banned");

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."vehicle_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_logs" ADD CONSTRAINT "operation_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trips" ADD CONSTRAINT "trips_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."vehicle_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
