/**
 * Çok-kiracılık (multi-tenant) — Teknik doküman Bölüm 3.1 / 7.
 * Auth henüz yok; tüm okuma/yazma şimdilik bu sabit DEV tenant ile yapılır.
 * JWT guard eklenince tenant_id token'dan çözülecek ve burası kaldırılacak.
 */
export const DEV_TENANT_ID = '00000000-0000-0000-0000-000000000001';
