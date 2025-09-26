/*
  Warnings:

  - You are about to drop the column `booking_source` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `booking_type` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `created_offline` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `is_verified` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `local_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `online_ticket_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `payment_status` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `sync_status` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `verified_at` on the `bookings` table. All the data in the column will be lost.
  - You are about to alter the column `total_amount` on the `bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to drop the column `first_name` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `phone_number` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `drivers` table. All the data in the column will be lost.
  - The `account_status` column on the `drivers` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `station_id` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `station_name` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `routes` table. All the data in the column will be lost.
  - You are about to alter the column `base_price` on the `routes` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to drop the column `last_login` on the `staff` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `staff` table. All the data in the column will be lost.
  - The `role` column on the `staff` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `destination_id` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `sync_status` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `is_default` on the `vehicle_authorized_stations` table. All the data in the column will be lost.
  - You are about to drop the column `priority` on the `vehicle_authorized_stations` table. All the data in the column will be lost.
  - You are about to drop the column `station_name` on the `vehicle_authorized_stations` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `vehicle_authorized_stations` table. All the data in the column will be lost.
  - You are about to drop the column `destination_name` on the `vehicle_queue` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `vehicle_queue` table. All the data in the column will be lost.
  - The `queueType` column on the `vehicle_queue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `vehicle_queue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `base_price` on the `vehicle_queue` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to drop the column `color` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `default_destination_id` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `default_destination_name` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `vehicles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[payment_reference]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[station_id,destination_id,queue_position]` on the table `vehicle_queue` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `departure_station_id` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination_station_id` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `journey_date` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Made the column `user_id` on table `bookings` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updated_at` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Made the column `origin_governorate_id` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `origin_delegation_id` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `departure_station_id` to the `routes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination_station_id` to the `routes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `departure_station_id` to the `trips` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination_station_id` to the `trips` table without a default value. This is not possible if the table is not empty.
  - Added the required column `station_id` to the `vehicle_queue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `vehicle_queue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `vehicles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."StaffRole" AS ENUM ('WORKER', 'SUPERVISOR', 'ADMIN', 'DRIVER');

-- CreateEnum
CREATE TYPE "public"."DriverStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."QueueType" AS ENUM ('OVERNIGHT', 'REGULAR');

-- CreateEnum
CREATE TYPE "public"."QueueStatus" AS ENUM ('WAITING', 'LOADING', 'READY', 'DEPARTED');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'PAID', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."SyncOperation" AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "public"."SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- DropForeignKey
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_queue_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."trips" DROP CONSTRAINT "trips_queue_id_fkey";

-- DropIndex
DROP INDEX "public"."bookings_local_id_key";

-- DropIndex
DROP INDEX "public"."bookings_online_ticket_id_key";

-- DropIndex
DROP INDEX "public"."routes_station_id_key";

-- AlterTable
ALTER TABLE "public"."bookings" DROP COLUMN "booking_source",
DROP COLUMN "booking_type",
DROP COLUMN "created_offline",
DROP COLUMN "customer_phone",
DROP COLUMN "is_verified",
DROP COLUMN "local_id",
DROP COLUMN "online_ticket_id",
DROP COLUMN "payment_method",
DROP COLUMN "payment_status",
DROP COLUMN "sync_status",
DROP COLUMN "verified_at",
ADD COLUMN     "departure_station_id" TEXT NOT NULL,
ADD COLUMN     "destination_station_id" TEXT NOT NULL,
ADD COLUMN     "estimated_arrival_time" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "journey_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "payment_reference" TEXT,
ADD COLUMN     "status" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "queue_id" DROP NOT NULL,
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."drivers" DROP COLUMN "first_name",
DROP COLUMN "last_name",
DROP COLUMN "phone_number",
DROP COLUMN "synced_at",
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "assigned_station_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "day_pass_expires_at" TIMESTAMP(3),
ADD COLUMN     "has_valid_day_pass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "origin_governorate_id" SET NOT NULL,
ALTER COLUMN "origin_delegation_id" SET NOT NULL,
DROP COLUMN "account_status",
ADD COLUMN     "account_status" "public"."DriverStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "is_active" SET DEFAULT false;

-- AlterTable
ALTER TABLE "public"."routes" DROP COLUMN "station_id",
DROP COLUMN "station_name",
DROP COLUMN "synced_at",
DROP COLUMN "updated_at",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "departure_station_id" TEXT NOT NULL,
ADD COLUMN     "destination_station_id" TEXT NOT NULL,
ALTER COLUMN "base_price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "public"."staff" DROP COLUMN "last_login",
DROP COLUMN "synced_at",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "station_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "public"."StaffRole" NOT NULL DEFAULT 'WORKER';

-- AlterTable
ALTER TABLE "public"."station_config" ADD COLUMN     "service_fee" DECIMAL(10,3) NOT NULL DEFAULT 0.200;

-- AlterTable
ALTER TABLE "public"."trips" DROP COLUMN "destination_id",
DROP COLUMN "sync_status",
DROP COLUMN "synced_at",
ADD COLUMN     "departure_station_id" TEXT NOT NULL,
ADD COLUMN     "destination_station_id" TEXT NOT NULL,
ALTER COLUMN "start_time" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."vehicle_authorized_stations" DROP COLUMN "is_default",
DROP COLUMN "priority",
DROP COLUMN "station_name",
DROP COLUMN "synced_at";

-- AlterTable
ALTER TABLE "public"."vehicle_queue" DROP COLUMN "destination_name",
DROP COLUMN "synced_at",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "station_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "queueType",
ADD COLUMN     "queueType" "public"."QueueType" NOT NULL DEFAULT 'REGULAR',
DROP COLUMN "status",
ADD COLUMN     "status" "public"."QueueStatus" NOT NULL DEFAULT 'WAITING',
ALTER COLUMN "entered_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "base_price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "public"."vehicles" DROP COLUMN "color",
DROP COLUMN "default_destination_id",
DROP COLUMN "default_destination_name",
DROP COLUMN "model",
DROP COLUMN "synced_at",
DROP COLUMN "year",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "capacity" SET DEFAULT 8;

-- CreateTable
CREATE TABLE "public"."governorates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governorates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."delegations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "governorate_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "governorate_id" TEXT NOT NULL,
    "delegation_id" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "local_server_ip" TEXT,
    "supervisor_id" TEXT,
    "service_fee" DECIMAL(10,3) NOT NULL DEFAULT 0.200,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "last_heartbeat" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_logs" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "operation" "public"."SyncOperation" NOT NULL,
    "data" JSONB NOT NULL,
    "sync_status" "public"."SyncStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."day_passes" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
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
CREATE TABLE "public"."exit_passes" (
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
CREATE UNIQUE INDEX "governorates_name_key" ON "public"."governorates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stations_supervisor_id_key" ON "public"."stations"("supervisor_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "public"."users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_payment_reference_key" ON "public"."bookings"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_queue_station_id_destination_id_queue_position_key" ON "public"."vehicle_queue"("station_id", "destination_id", "queue_position");

-- AddForeignKey
ALTER TABLE "public"."delegations" ADD CONSTRAINT "delegations_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stations" ADD CONSTRAINT "stations_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stations" ADD CONSTRAINT "stations_delegation_id_fkey" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stations" ADD CONSTRAINT "stations_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."staff" ADD CONSTRAINT "staff_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_origin_governorate_id_fkey" FOREIGN KEY ("origin_governorate_id") REFERENCES "public"."governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_origin_delegation_id_fkey" FOREIGN KEY ("origin_delegation_id") REFERENCES "public"."delegations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_assigned_station_id_fkey" FOREIGN KEY ("assigned_station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_authorized_stations" ADD CONSTRAINT "vehicle_authorized_stations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_queue" ADD CONSTRAINT "vehicle_queue_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_queue" ADD CONSTRAINT "vehicle_queue_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routes" ADD CONSTRAINT "routes_departure_station_id_fkey" FOREIGN KEY ("departure_station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routes" ADD CONSTRAINT "routes_destination_station_id_fkey" FOREIGN KEY ("destination_station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_departure_station_id_fkey" FOREIGN KEY ("departure_station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_destination_station_id_fkey" FOREIGN KEY ("destination_station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."vehicle_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sync_logs" ADD CONSTRAINT "sync_logs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_logs" ADD CONSTRAINT "operation_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trips" ADD CONSTRAINT "trips_departure_station_id_fkey" FOREIGN KEY ("departure_station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trips" ADD CONSTRAINT "trips_destination_station_id_fkey" FOREIGN KEY ("destination_station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trips" ADD CONSTRAINT "trips_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."vehicle_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."day_passes" ADD CONSTRAINT "day_passes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."day_passes" ADD CONSTRAINT "day_passes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."day_passes" ADD CONSTRAINT "day_passes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exit_passes" ADD CONSTRAINT "exit_passes_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."vehicle_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exit_passes" ADD CONSTRAINT "exit_passes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exit_passes" ADD CONSTRAINT "exit_passes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
