-- CreateTable
CREATE TABLE "order_refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "coupon_code" TEXT,
    "reason" TEXT,
    "items" JSONB NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_refunds_tenant_id_order_id_idx" ON "order_refunds"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "order_refunds_tenant_id_created_at_idx" ON "order_refunds"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
