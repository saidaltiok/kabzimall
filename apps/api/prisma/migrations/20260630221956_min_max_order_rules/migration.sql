-- AlterTable
ALTER TABLE "products" ADD COLUMN     "max_per_order" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "min_order_total" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_tenant_id_key" ON "store_settings"("tenant_id");
