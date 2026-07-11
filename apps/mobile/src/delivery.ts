import type { DeliveryTier } from './types';

/**
 * Teslimat ücreti (kuruş): alt toplamı karşılayan en yüksek eşiğin ücreti.
 * Örn. tiers [{0,4990},{40000,0}] → 400₺ ve üzeri ücretsiz.
 */
export function deliveryFee(subtotal: number, tiers: DeliveryTier[] | undefined): number {
  if (!tiers || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);
  let fee = sorted[0].fee;
  for (const t of sorted) if (subtotal >= t.minSubtotal) fee = t.fee;
  return fee;
}

/** Ücretsiz teslimat eşiği (kuruş) — fee=0 olan en düşük eşik. */
export function freeDeliveryThreshold(tiers: DeliveryTier[] | undefined): number | null {
  if (!tiers) return null;
  const free = tiers.filter((t) => t.fee === 0).sort((a, b) => a.minSubtotal - b.minSubtotal);
  return free.length ? free[0].minSubtotal : null;
}
