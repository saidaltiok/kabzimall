-- Teslimat ücretini kademeli tarifeye (JSON) taşı.
-- Eski scalar alanlar (delivery_fee, free_delivery_threshold) tek bir tarife dizisine dönüşür.
ALTER TABLE "store_settings"
  ADD COLUMN "delivery_tiers" JSONB NOT NULL
  DEFAULT '[{"minSubtotal":0,"fee":4990},{"minSubtotal":40000,"fee":0}]';

-- Varsa mevcut satırı eski alanlardan kademe dizisine çevir (0+ temel ücret, eşik üstü ücretsiz).
UPDATE "store_settings"
SET "delivery_tiers" = jsonb_build_array(
  jsonb_build_object('minSubtotal', 0, 'fee', "delivery_fee")
) || CASE
  WHEN "free_delivery_threshold" > 0
    THEN jsonb_build_array(jsonb_build_object('minSubtotal', "free_delivery_threshold", 'fee', 0))
  ELSE '[]'::jsonb
END;

-- Şema ile birebir olsun diye DB default'unu kaldır (uygulama her zaman değer yazar).
ALTER TABLE "store_settings" ALTER COLUMN "delivery_tiers" DROP DEFAULT;

ALTER TABLE "store_settings" DROP COLUMN "delivery_fee";
ALTER TABLE "store_settings" DROP COLUMN "free_delivery_threshold";
