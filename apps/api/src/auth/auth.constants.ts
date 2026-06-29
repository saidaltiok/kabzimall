/** Panel rolleri (Teknik doküman Bölüm 7). */
export const ROLES = ['ADMIN', 'PRICE_MANAGER', 'OPERATION', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/** Intelligence yazma yetkisi olan roller (fiyat yöneticisi+). */
export const PRICE_WRITERS: Role[] = ['ADMIN', 'PRICE_MANAGER'];

/** Katalog (ürün/kategori) yazma yetkisi olan roller (operasyon+). */
export const CATALOG_WRITERS: Role[] = ['ADMIN', 'OPERATION'];

/** JWT içeriği. */
export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
  tenantId: string;
}

export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me-in-prod';
