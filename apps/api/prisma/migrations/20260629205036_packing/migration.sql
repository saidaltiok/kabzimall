-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "picked_qty" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "final_total" INTEGER;
