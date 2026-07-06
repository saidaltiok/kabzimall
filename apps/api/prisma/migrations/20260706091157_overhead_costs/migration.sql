-- CreateTable
CREATE TABLE "overhead_costs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "kind" TEXT NOT NULL DEFAULT 'FIXED',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "incurred_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overhead_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overhead_costs_tenant_id_is_active_idx" ON "overhead_costs"("tenant_id", "is_active");
