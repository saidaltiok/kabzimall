-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "base_price" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "old_price" INTEGER,
    "new_price" INTEGER NOT NULL,
    "strategy_applied" TEXT NOT NULL,
    "reason" TEXT,
    "net_margin" DOUBLE PRECISION,
    "changed_by" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hal_purchases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_slug" TEXT,
    "recorded_kg" DOUBLE PRECISION NOT NULL,
    "actual_kg" DOUBLE PRECISION,
    "total_paid" INTEGER NOT NULL,
    "precision_kg" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hal_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_pool_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "total_labor" INTEGER NOT NULL,
    "total_fuel" INTEGER NOT NULL,
    "total_cold_storage" INTEGER,
    "total_amortization" INTEGER,
    "total_volume_kg" DOUBLE PRECISION NOT NULL,
    "preview_product" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_pool_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_slug_key" ON "products"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "price_history_tenant_id_product_id_idx" ON "price_history"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "hal_purchases_tenant_id_product_slug_idx" ON "hal_purchases"("tenant_id", "product_slug");

-- CreateIndex
CREATE INDEX "cost_pool_entries_tenant_id_period_idx" ON "cost_pool_entries"("tenant_id", "period");

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
