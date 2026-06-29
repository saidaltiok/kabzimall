-- CreateTable
CREATE TABLE "hal_price_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_slug" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "unit" TEXT,
    "date" DATE NOT NULL,
    "time_slot" TEXT,
    "source" TEXT,
    "captured_by" TEXT,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hal_price_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hal_price_entries_tenant_id_date_idx" ON "hal_price_entries"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "hal_price_entries_tenant_id_product_slug_date_idx" ON "hal_price_entries"("tenant_id", "product_slug", "date");
