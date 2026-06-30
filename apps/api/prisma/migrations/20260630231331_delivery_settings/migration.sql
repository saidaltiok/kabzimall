-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "delivery_fee" INTEGER NOT NULL DEFAULT 4990,
ADD COLUMN     "free_delivery_threshold" INTEGER NOT NULL DEFAULT 40000;
