-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL DEFAULT '',
    "strategy" TEXT,
    "target_margin" DOUBLE PRECISION,
    "floor_margin" DOUBLE PRECISION,
    "psychological" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_tenant_id_scope_ref_id_key" ON "pricing_rules"("tenant_id", "scope", "ref_id");
