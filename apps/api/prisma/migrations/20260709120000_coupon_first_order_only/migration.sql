-- İlk siparişe özel kupon bayrağı (aynı telefon/e-posta ile önceki sipariş yoksa geçerli).
ALTER TABLE "coupons" ADD COLUMN "first_order_only" BOOLEAN NOT NULL DEFAULT false;
