-- CreateTable
CREATE TABLE "product_substitutes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "substitute_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_substitutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_substitutes_tenant_id_product_id_idx" ON "product_substitutes"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_substitutes_product_id_substitute_id_key" ON "product_substitutes"("product_id", "substitute_id");

-- AddForeignKey
ALTER TABLE "product_substitutes" ADD CONSTRAINT "product_substitutes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_substitutes" ADD CONSTRAINT "product_substitutes_substitute_id_fkey" FOREIGN KEY ("substitute_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
