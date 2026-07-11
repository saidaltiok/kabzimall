import type { Product } from './types';
import type { CartLine } from './cart';
import { emojiFor } from './format';

/** Satış fiyatı: indirimliyse o, yoksa taban (kuruş). */
export const effectivePrice = (p: Pick<Product, 'basePrice' | 'discountedPrice'>) =>
  p.discountedPrice ?? p.basePrice;

/** İndirim varsa üstü çizili taban fiyat, yoksa null. */
export const oldPrice = (p: Pick<Product, 'basePrice' | 'discountedPrice'>) =>
  p.discountedPrice != null && p.discountedPrice < p.basePrice ? p.basePrice : null;

/** İndirim yüzdesi (0–100) ya da null. */
export function discountPct(p: Pick<Product, 'basePrice' | 'discountedPrice'>): number | null {
  const old = oldPrice(p);
  if (!old) return null;
  return Math.round((1 - effectivePrice(p) / old) * 100);
}

/** Product → sepet satırının değişmez alanları (qty hariç). */
export function toCartLine(p: Product): Omit<CartLine, 'qty'> {
  return {
    slug: p.slug,
    name: p.name,
    emoji: emojiFor(p.slug, p.category?.slug),
    unitLabel: p.unitLabel,
    saleType: p.saleType,
    unitPrice: effectivePrice(p),
    isBasket: false,
  };
}
