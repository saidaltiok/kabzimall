import { Injectable } from '@nestjs/common';

/** Bir ürünün mağaza fiyatı kaydı (iskelet). */
export interface ProductRecord {
  id: string;
  /** Yayınlanan mağaza fiyatı (kuruş). Henüz fiyat uygulanmadıysa null. */
  basePrice: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bellek içi ürün kaydı (iskelet). Üretimde Market `products` tablosu;
 * /intel/price/apply yalnızca `base_price` kolonunu günceller.
 *
 * Katalog modülü henüz yok; bu nedenle apply, bilinmeyen productId için
 * yer tutucu bir kayıt oluşturur (fiyat döngüsü uçtan uca denenebilsin diye).
 */
@Injectable()
export class ProductsStore {
  private readonly store = new Map<string, ProductRecord>();

  /** Ürünü getir; yoksa (katalog gelene dek) yer tutucu olarak oluştur. */
  getOrCreate(id: string): ProductRecord {
    let product = this.store.get(id);
    if (!product) {
      const now = new Date().toISOString();
      product = { id, basePrice: null, createdAt: now, updatedAt: now };
      this.store.set(id, product);
    }
    return product;
  }

  /** base_price'ı günceller; eski fiyatı (price_history için) döndürür. */
  setBasePrice(id: string, price: number): { product: ProductRecord; oldPrice: number | null } {
    const product = this.getOrCreate(id);
    const oldPrice = product.basePrice;
    product.basePrice = price;
    product.updatedAt = new Date().toISOString();
    return { product, oldPrice };
  }

  findOne(id: string): ProductRecord | undefined {
    return this.store.get(id);
  }

  list(): ProductRecord[] {
    return [...this.store.values()];
  }
}
