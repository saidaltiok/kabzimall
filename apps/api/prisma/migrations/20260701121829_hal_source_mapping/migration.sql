-- CreateTable
CREATE TABLE "hal_source_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'IBB',
    "source_name" TEXT NOT NULL,
    "product_slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hal_source_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hal_source_mappings_tenant_id_source_source_name_key" ON "hal_source_mappings"("tenant_id", "source", "source_name");
