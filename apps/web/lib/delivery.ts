// Kademeli teslimat ücreti (vitrin gösterimi). Nihai ücret yine sunucuda hesaplanır;
// bu yalnızca sepet/ödeme önizlemesi içindir (aynı mantık: packages/pricing.deliveryFee).
export interface DeliveryTier {
  minSubtotal: number; // kuruş
  fee: number; // kuruş (0 = ücretsiz)
}

export interface StoreSettings {
  minOrderTotal: number;
  deliveryTiers: DeliveryTier[];
}

export const DEFAULT_SETTINGS: StoreSettings = {
  minOrderTotal: 0,
  deliveryTiers: [
    { minSubtotal: 0, fee: 4990 },
    { minSubtotal: 40000, fee: 0 },
  ],
};

const sorted = (tiers: DeliveryTier[]) => [...tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);

/** Sepet ara toplamının geçtiği en yüksek kademenin ücreti. */
export function feeForSubtotal(subtotal: number, tiers: DeliveryTier[]): number {
  let fee = 0;
  for (const t of sorted(tiers)) if (subtotal >= t.minSubtotal) fee = t.fee;
  return fee;
}

/** Bir sonraki (daha ucuz) kademe — "X ₺ daha ekle" teşviki için. */
export function nextTier(subtotal: number, tiers: DeliveryTier[]): DeliveryTier | null {
  return sorted(tiers).find((t) => t.minSubtotal > subtotal) ?? null;
}
