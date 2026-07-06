-- AlterTable
ALTER TABLE "products" ADD COLUMN     "markdown_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "markdown_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PRICE_DECAY',
    "pct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "stale_days" INTEGER NOT NULL DEFAULT 2,
    "allow_below_cost" BOOLEAN NOT NULL DEFAULT false,
    "max_total_off_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markdown_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "register_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "opening_float" INTEGER NOT NULL,
    "opened_by" TEXT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" TEXT,
    "counted_close" INTEGER,
    "expected_close" INTEGER,
    "note" TEXT,

    CONSTRAINT "register_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "ref_code" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "markdown_rules_tenant_id_scope_ref_id_key" ON "markdown_rules"("tenant_id", "scope", "ref_id");

-- CreateIndex
CREATE INDEX "register_sessions_tenant_id_opened_at_idx" ON "register_sessions"("tenant_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_session_id_idx" ON "cash_movements"("tenant_id", "session_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "register_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
