-- CreateTable
CREATE TABLE "basket_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "basket_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "basket_items" (
    "id" UUID NOT NULL,
    "basket_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "basket_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "basket_templates_tenant_id_slug_key" ON "basket_templates"("tenant_id", "slug");

-- AddForeignKey
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_basket_id_fkey" FOREIGN KEY ("basket_id") REFERENCES "basket_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
