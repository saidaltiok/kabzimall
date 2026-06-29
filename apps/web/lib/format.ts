/** Kuruş (integer) → "34,90 ₺". */
export function tl(kurus: number | null | undefined): string {
  if (kurus == null) return '—';
  return (
    (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
  );
}

/** Ürün slug/kategorisine göre dekoratif emoji (görsel yer tutucu). */
const EMOJI: Record<string, string> = {
  domates: '🍅', cilek: '🍓', muz: '🍌', salatalik: '🥒', biber: '🫑', elma: '🍎',
  patates: '🥔', zeytinyagi: '🫒', nareksisi: '🍶', bal: '🍯', peynir: '🧀', yumurta: '🥚',
};
export function emojiFor(slug: string, categorySlug?: string | null): string {
  if (EMOJI[slug]) return EMOJI[slug];
  if (categorySlug === 'meyve') return '🍏';
  if (categorySlug === 'sebze') return '🥬';
  return '🧺';
}
