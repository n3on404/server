-- DropForeignKey
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_queue_id_fkey";

-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "queue_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "vehicle_queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
