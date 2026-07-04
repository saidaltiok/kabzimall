-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "slot_change_date" DATE,
ADD COLUMN     "slot_change_status" TEXT,
ADD COLUMN     "slot_change_window" TEXT;
