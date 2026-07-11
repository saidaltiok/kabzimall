import type { Order } from './types';

/** Siparişin gösterilecek toplamı: paketleme sonrası kesin (final) → sipariş anı. */
export function orderTotal(o: Pick<Order, 'finalTotal' | 'grandTotal' | 'estimatedTotal' | 'subtotal'>): number {
  return o.finalTotal ?? o.grandTotal ?? o.estimatedTotal ?? o.subtotal ?? 0;
}

/** Teslimat penceresi etiketi: "12.07 · 13:00-16:00" ya da "planlanıyor". */
export function orderSlotLabel(o: Pick<Order, 'deliveryDate' | 'deliveryWindow'>): string {
  if (!o.deliveryDate && !o.deliveryWindow) return 'planlanıyor';
  const d = o.deliveryDate ? o.deliveryDate.slice(5).split('-').reverse().join('.') : '';
  return [d, o.deliveryWindow].filter(Boolean).join(' · ');
}

/** Kuruş (integer) → "34,90 ₺". API tüm para alanlarını kuruş döner. */
export function tl(kurus: number | null | undefined): string {
  if (kurus == null) return '—';
  return (kurus / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ₺';
}

/** Kuruş → "34,90" (birim/simge olmadan; ₺ ayrı gösterilecekse). */
export function tlBare(kurus: number | null | undefined): string {
  if (kurus == null) return '—';
  return (kurus / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Miktarı okunur yaz: 1.5 kg → "1,5 kg", 3 adet → "3 adet". */
export function qtyLabel(qty: number, unit: string): string {
  const isWeight = unit === 'kg';
  const n = isWeight
    ? qty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
    : String(Math.round(qty));
  return `${n} ${unit}`;
}

/** Ürün slug/kategorisine göre dekoratif emoji (görsel yer tutucu — web ile aynı). */
const EMOJI: Record<string, string> = {
  domates: '🍅', cilek: '🍓', muz: '🍌', salatalik: '🥒', biber: '🫑', elma: '🍎',
  patates: '🥔', zeytinyagi: '🫒', nareksisi: '🍶', bal: '🍯', peynir: '🧀', yumurta: '🥚',
  portakal: '🍊', limon: '🍋', karpuz: '🍉', uzum: '🍇', armut: '🍐', seftali: '🍑',
  kiraz: '🍒', mandalina: '🍊', avokado: '🥑', maydanoz: '🌿', sogan: '🧅', sarimsak: '🧄',
  havuc: '🥕', misir: '🌽', mantar: '🍄', patlican: '🍆', brokoli: '🥦', ispanak: '🥬',
  ceviz: '🌰', findik: '🌰', kayisi: '🍑', incir: '🫐', nar: '🍎', mandalin: '🍊',
};

export function emojiFor(slug: string, categorySlug?: string | null): string {
  const key = (slug || '').toLowerCase();
  if (EMOJI[key]) return EMOJI[key];
  // slug parçalarından yakala (ör. "cherry-domates")
  for (const k of Object.keys(EMOJI)) if (key.includes(k)) return EMOJI[k];
  if (categorySlug === 'meyve') return '🍏';
  if (categorySlug === 'sebze') return '🥬';
  if (categorySlug === 'yoresel') return '🏺';
  return '🧺';
}
