/**
 * Panel rolleri (Teknik doküman Bölüm 7 / PRD §4.2).
 * ADMIN         — tam yetki
 * PRICE_MANAGER — fiyat zekâsı yazar (hal/rakip/maliyet/öneri/uygula/kural)
 * OPERATION     — katalog + sipariş operasyonu
 * PACKER        — paketleme + sipariş durum ilerletme (fiyat/katalog YAZAMAZ)
 * COURIER       — teslimat: sipariş durumunu ilerletir
 * SUPPORT       — müşteri desteği (yalnızca okuma; yazma yok)
 * VIEWER        — salt okuma
 */
export const ROLES = ['ADMIN', 'PRICE_MANAGER', 'OPERATION', 'PACKER', 'COURIER', 'SUPPORT', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/** Intelligence yazma yetkisi (fiyat/hal/rakip/maliyet/kural). */
export const PRICE_WRITERS: Role[] = ['ADMIN', 'PRICE_MANAGER'];

/** Katalog + mağaza ayarları yazma yetkisi. */
export const CATALOG_WRITERS: Role[] = ['ADMIN', 'OPERATION'];

/** Sipariş operasyonu: durum ilerletme + paketleme (fiyat/kataloğa dokunmaz). */
export const ORDER_WRITERS: Role[] = ['ADMIN', 'OPERATION', 'PACKER', 'COURIER'];

/** JWT içeriği. */
export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
  tenantId: string;
}

// Üretimde JWT_SECRET ZORUNLU — env yoksa boot'ta fail-fast (sessizce zayıf
// gizle çalışmaz). Dev/test'te sabit dev gizli kullanılır.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET production ortamında zorunludur (apps/api/src/auth/auth.constants.ts).');
}
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-not-for-prod';

/**
 * Müşteri OTP token'ı için AYRI gizli anahtar (defense-in-depth): personel
 * gizli sızsa bile müşteri token'ı üretilemesin ve tersi. Set edilmezse
 * personel gizlisinden türetilir — yine de personel gizlisinden FARKLIDIR.
 */
export const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET ?? `${JWT_SECRET}::customer`;
