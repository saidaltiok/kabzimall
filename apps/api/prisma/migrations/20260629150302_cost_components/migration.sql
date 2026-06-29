-- CreateTable
CREATE TABLE "cost_components" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL DEFAULT '',
    "fire_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packaging" INTEGER NOT NULL DEFAULT 0,
    "labor" INTEGER NOT NULL DEFAULT 0,
    "fuel" INTEGER NOT NULL DEFAULT 0,
    "cold_storage" INTEGER NOT NULL DEFAULT 0,
    "amortization" INTEGER NOT NULL DEFAULT 0,
    "commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cost_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_components_tenant_id_scope_ref_id_key" ON "cost_components"("tenant_id", "scope", "ref_id");
