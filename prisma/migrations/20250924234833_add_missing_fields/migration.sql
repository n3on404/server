/*
  Warnings:

  - A unique constraint covering the columns `[online_ticket_id]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `destination_id` to the `trips` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination_name` to the `vehicle_queue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."bookings" ADD COLUMN     "booking_source" TEXT NOT NULL DEFAULT 'STATION',
ADD COLUMN     "booking_type" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "online_ticket_id" TEXT,
ADD COLUMN     "payment_method" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."staff" ADD COLUMN     "last_login" TIMESTAMP(3),
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."trips" ADD COLUMN     "destination_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."vehicle_queue" ADD COLUMN     "destination_name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_online_ticket_id_key" ON "public"."bookings"("online_ticket_id");
