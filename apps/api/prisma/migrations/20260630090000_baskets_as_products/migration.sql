-- Hazır sepetler artık ayrı birer ürün (kind=BASKET). Eski şablon tabloları kaldırılır.
DROP TABLE "basket_items";
DROP TABLE "basket_templates";

-- Ürün türü
ALTER TABLE "products" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SIMPLE';

-- Sepet içeriği (parent BASKET ürünü → component ürünler)
CREATE TABLE "product_components" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "product_components_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_components" ADD CONSTRAINT "product_components_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
