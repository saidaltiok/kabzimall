-- CreateTable
CREATE TABLE "competitor_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group_id" UUID NOT NULL,
    "type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_price_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_slug" TEXT NOT NULL,
    "competitor_id" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "source" TEXT,
    "date" DATE NOT NULL,
    "captured_by" TEXT,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_price_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competitor_groups_tenant_id_name_key" ON "competitor_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "competitors_tenant_id_idx" ON "competitors"("tenant_id");

-- CreateIndex
CREATE INDEX "competitor_price_entries_tenant_id_product_slug_date_idx" ON "competitor_price_entries"("tenant_id", "product_slug", "date");

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "competitor_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_price_entries" ADD CONSTRAINT "competitor_price_entries_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
