-- AlterTable
ALTER TABLE "cash_movements" ALTER COLUMN "session_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "rating_comment" TEXT;

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "slot_capacity" INTEGER;
