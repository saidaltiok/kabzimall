-- CreateTable
CREATE TABLE "customer_otps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_otps_tenant_id_email_idx" ON "customer_otps"("tenant_id", "email");
