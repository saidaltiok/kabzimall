/**
 * KabzıMall — Fiyatlandırma Motoru (tek kaynak) · v2
 * --------------------------------------------------------------
 * Mobil, web, admin ve backend AYNI fonksiyonları çağırır.
 * Para birimi: integer "kuruş" (minor units). 3490 = 34,90 ₺.
 *
 * v2 eklentileri:
 *  - HAL_MARKUP stratejisi (hal fiyatının %X fazlası — otomatik fiyatlama)
 *  - resolvePrice(): HİYERARŞİK fallback zinciri (rakip yoksa hata yerine
 *    bir sonraki kurala düşer; "her ihtimali kapsar")
 *  - Fırsat ürünü (opportunity): taban marjı bypass eder, zararına satışa izin
 *  - Hal alım mutabakatı: tartı hassasiyeti (±500 g) ve efektif kg maliyeti
 */

export type Kurus = number;

export interface CostInput {
  /** Günlük hal alış fiyatı (kuruş). */
  halAvg: Kurus;
  /** Fire (zayiat) oranı 0..1. */
  fireRate: number;
  labor: Kurus;
  packaging: Kurus;
  fuel: Kurus;
  coldStorage?: Kurus;
  amortization?: Kurus;
  /** Kart komisyonu (satış fiyatı üzerinden) 0..1. */
  commissionRate: number;
}

export interface Competitor {
  name: string;
  group: string;
  price: Kurus;
}

export type Strategy =
  | 'MARGIN'          // maliyet + hedef net marj
  | 'HAL_MARKUP'      // hal fiyatı × (1 + halMarkupPct)  ← otomatik fiyatlama
  | 'COMP_AVG'        // rakip ortalaması
  | 'COMP_AVG_MINUS'  // rakip ortalaması × (1 − minusPct)
  | 'MEDIAN'          // rakip medyanı
  | 'LOWEST'          // en düşük rakip
  | 'GROUP_AVG'       // belirli grup ortalaması
  | 'FLOOR'           // taban marjı veren fiyat
  | 'MANUAL';         // elle girilen fiyat

export interface SuggestParams {
  targetMargin?: number;     // MARGIN
  floorMargin?: number;      // taban; varsayılan 0.15
  minusPct?: number;         // COMP_AVG_MINUS; varsayılan 0.03
  group?: string;            // GROUP_AVG
  manualPrice?: Kurus;       // MANUAL
  halMarkupPct?: number;     // HAL_MARKUP; varsayılan 1.0 (%100)
  psychological?: boolean;   // varsayılan true
  /** Fırsat ürünü: taban marj uygulanmaz, zararına satışa izin verilir. */
  opportunity?: boolean;
}

export interface SuggestResult {
  price: Kurus;
  netMargin: number;
  competitionIndex: number | null;
  directCost: Kurus;
  /** Taban marj koruması devreye girdi mi? */
  floored: boolean;
  /** Fiyat doğrudan maliyetin altında mı? (fırsat ürünlerinde olabilir) */
  belowCost: boolean;
  /** Uygulanan strateji (fallback sonrası gerçekte kullanılan). */
  strategy: Strategy;
  /** İstenen strateji veri yokluğundan atlandı mı? */
  usedFallback: boolean;
  opportunity: boolean;
}

export const DEFAULT_FLOOR_MARGIN = 0.15;

/** Rakip yoksa varsayılan güvenli fallback zinciri. */
export const DEFAULT_CHAIN: { strategy: Strategy; params?: SuggestParams }[] = [
  { strategy: 'COMP_AVG' },
  { strategy: 'MARGIN' },                          // maliyet + hedef marj
  { strategy: 'HAL_MARKUP', params: { halMarkupPct: 1.0 } }, // hal + %100
  { strategy: 'FLOOR' },                           // son çare: taban marj
];

/* ----------------------------- Çekirdek ----------------------------- */

/** Fire DÂHİL maliyet — fire TOPLANMAZ, BÖLÜNÜR. %20 fire → +%25. */
export function fireCost(c: CostInput): number {
  if (c.fireRate < 0 || c.fireRate >= 1) {
    throw new RangeError('fireRate 0..1 (1 hariç) aralığında olmalı');
  }
  return c.halAvg / (1 - c.fireRate);
}

export function directCost(c: CostInput): number {
  return (
    fireCost(c) + c.labor + c.packaging + c.fuel +
    (c.coldStorage ?? 0) + (c.amortization ?? 0)
  );
}

export function netMargin(c: CostInput, price: number): number {
  if (price <= 0) return 0;
  return (price - directCost(c) - price * c.commissionRate) / price;
}

export function priceForMargin(c: CostInput, m: number): number {
  const denom = 1 - m - c.commissionRate;
  if (denom <= 0) throw new RangeError('marj + komisyon < 1 olmalı');
  return directCost(c) / denom;
}

/** Psikolojik yuvarlama: en yakın liraya yuvarla, 10 kuruş düş (… ,90). */
export function psych(kurus: number): Kurus {
  const lira = Math.round(kurus / 100);
  return Math.max(90, lira * 100 - 10);
}

/* ---------------------------- Yardımcılar --------------------------- */

export function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function competitionIndex(price: Kurus, competitors: Competitor[]): number | null {
  if (!competitors.length) return null;
  return Math.round((price / avg(competitors.map((x) => x.price))) * 100);
}

/* ------------------------- Strateji motoru -------------------------- */

/** Ham (yuvarlanmamış) strateji değeri. Veri yoksa NaN/0 dönebilir. */
function strategyValue(
  c: CostInput, competitors: Competitor[], strategy: Strategy, params: SuggestParams
): number {
  const prices = competitors.map((x) => x.price);
  switch (strategy) {
    case 'MARGIN':         return priceForMargin(c, params.targetMargin ?? 0.3);
    case 'HAL_MARKUP':     return c.halAvg * (1 + (params.halMarkupPct ?? 1.0));
    case 'COMP_AVG':       return avg(prices);
    case 'COMP_AVG_MINUS': return avg(prices) * (1 - (params.minusPct ?? 0.03));
    case 'MEDIAN':         return median(prices);
    case 'LOWEST':         return prices.length ? Math.min(...prices) : NaN;
    case 'GROUP_AVG': {
      const g = competitors.filter((x) => x.group === params.group).map((x) => x.price);
      return g.length ? avg(g) : NaN;
    }
    case 'FLOOR':          return priceForMargin(c, params.floorMargin ?? DEFAULT_FLOOR_MARGIN);
    case 'MANUAL':         return params.manualPrice ?? NaN;
    default:               return priceForMargin(c, params.targetMargin ?? 0.3);
  }
}

/** Ham değeri yuvarla + taban marj / fırsat kurallarını uygula. */
function finalize(
  c: CostInput, competitors: Competitor[], strategy: Strategy,
  params: SuggestParams, raw: number, usedFallback: boolean
): SuggestResult {
  const floor = params.floorMargin ?? DEFAULT_FLOOR_MARGIN;
  const usePsych = params.psychological ?? true;
  const opportunity = !!params.opportunity;

  let price = strategy === 'MANUAL' && !usePsych ? Math.round(raw) : psych(raw);
  let floored = false;

  if (!opportunity && netMargin(c, price) < floor) {
    const lifted = priceForMargin(c, floor);
    price = usePsych ? psych(lifted) : Math.round(lifted);
    floored = true;
  }
  const dc = Math.round(directCost(c));
  return {
    price,
    netMargin: netMargin(c, price),
    competitionIndex: competitionIndex(price, competitors),
    directCost: dc,
    floored,
    belowCost: price < dc,
    strategy,
    usedFallback,
    opportunity,
  };
}

/** Tek strateji ile öneri (fallback yok). */
export function suggestPrice(
  c: CostInput, competitors: Competitor[], strategy: Strategy, params: SuggestParams = {}
): SuggestResult {
  return finalize(c, competitors, strategy, params, strategyValue(c, competitors, strategy, params), false);
}

/**
 * HİYERARŞİK çözüm: zincirdeki ilk geçerli (sonlu, > 0) stratejiyi uygular.
 * Örn. COMP_AVG ister ama rakip yoksa → MARGIN → HAL_MARKUP → FLOOR.
 * Böylece "tüm ürünlere rakip ortalaması uygula" dersen, rakibi olmayan
 * ürün hata vermez; otomatik olarak güvenli kurala düşer.
 */
export function resolvePrice(
  c: CostInput, competitors: Competitor[],
  chain: { strategy: Strategy; params?: SuggestParams }[] = DEFAULT_CHAIN,
  baseParams: SuggestParams = {}
): SuggestResult {
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const merged = { ...baseParams, ...(step.params ?? {}) };
    const raw = strategyValue(c, competitors, step.strategy, merged);
    if (Number.isFinite(raw) && raw > 0) {
      return finalize(c, competitors, step.strategy, merged, raw, i > 0);
    }
  }
  // Hiçbiri olmadıysa: taban marj (her zaman hesaplanabilir).
  return finalize(c, competitors, 'FLOOR', baseParams,
    priceForMargin(c, baseParams.floorMargin ?? DEFAULT_FLOOR_MARGIN), true);
}

/* ----------------- Hal alım mutabakatı (tartı hassasiyeti) ---------------- */

export interface HalPurchase {
  /** Halde tartıda görünen kg (ör. 500 g hassasiyetle). */
  recordedKg: number;
  /** Mağazada yeniden tartıldığında gerçekleşen kg (bilinmiyorsa boş). */
  actualKg?: number;
  /** Ödenen toplam (kuruş). */
  totalPaid: Kurus;
}

export interface HalReconciliation {
  recordedUnitCost: Kurus; // toplam / recordedKg
  actualUnitCost: Kurus | null;
  deltaKg: number | null;  // + : beklenenden fazla mal (kazanç)
  /** Birim maliyete etki: + ise gerçek maliyet düşük (kazanç), − ise yüksek (kayıp). */
  impactPct: number | null;
}

/**
 * Halde tartı hassasiyeti (±precisionKg) nedeniyle birim maliyetin
 * en fazla ne kadar sapabileceği. Toplam ağırlık büyüdükçe oran küçülür.
 * Örn. 50 kg'da ±0,5 kg = %1; 2 kg'da ±0,5 kg = %25.
 */
export function weightPrecisionRiskPct(recordedKg: number, precisionKg = 0.5): number {
  if (recordedKg <= 0) return 0;
  return precisionKg / recordedKg;
}

/* ----------------------- Sipariş para hesapları ----------------------- */

/** Satır toplamı: birim fiyat × miktar (tartılı üründe miktar ondalık kg). */
export function lineTotal(unitPrice: Kurus, qty: number): Kurus {
  return Math.round(unitPrice * qty);
}

export interface DeliveryTier {
  /** Bu eşik ve üstündeki sepet tutarına uygulanan ücret. */
  minSubtotal: Kurus;
  fee: Kurus;
}

/** Kademeli teslimat ücreti (v1.1 §7): eşik üstü ücretsiz. Tümü kuruş. */
export const DEFAULT_DELIVERY_TIERS: DeliveryTier[] = [
  { minSubtotal: 0, fee: 4990 },
  { minSubtotal: 25000, fee: 2990 },
  { minSubtotal: 40000, fee: 0 }, // 400 ₺ üstü ücretsiz
];

/** Sepet ara toplamına göre teslimat ücreti (geçilen en yüksek eşik). */
export function deliveryFee(subtotal: Kurus, tiers: DeliveryTier[] = DEFAULT_DELIVERY_TIERS): Kurus {
  let fee = 0;
  for (const t of [...tiers].sort((a, b) => a.minSubtotal - b.minSubtotal)) {
    if (subtotal >= t.minSubtotal) fee = t.fee;
  }
  return fee;
}

/** Gerçek tartı bilindiğinde efektif birim maliyet ve kazanç/kayıp etkisi. */
export function reconcileHalPurchase(p: HalPurchase): HalReconciliation {
  const recordedUnitCost = Math.round(p.totalPaid / p.recordedKg);
  if (p.actualKg == null || p.actualKg <= 0) {
    return { recordedUnitCost, actualUnitCost: null, deltaKg: null, impactPct: null };
  }
  const actualUnitCost = Math.round(p.totalPaid / p.actualKg);
  return {
    recordedUnitCost,
    actualUnitCost,
    deltaKg: +(p.actualKg - p.recordedKg).toFixed(3),
    impactPct: (recordedUnitCost - actualUnitCost) / recordedUnitCost,
  };
}
