-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'WEB';

-- CreateIndex
CREATE INDEX "orders_tenant_id_channel_created_at_idx" ON "orders"("tenant_id", "channel", "created_at");
