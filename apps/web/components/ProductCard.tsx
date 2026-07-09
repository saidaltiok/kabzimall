'use client';

import Link from 'next/link';
import Icon from './Icon';
import { tl, emojiFor } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useFavs } from '@/lib/favs';

export interface CardProduct {
  slug: string; name: string; unitLabel: string | null; imageUrl: string | null;
  basePrice: number; discountedPrice: number | null; stockQty: number | null;
  maxPerOrder: number | null; originRegion: string | null;
  isFreshDaily: boolean; isLocal: boolean;
  /** Son 24 saatte hal alımı yapıldı — tazelik kanıtı rozeti. */
  freshToday?: boolean;
  category: { slug: string; name: string } | null;
}

/** Vitrinde geçerli fiyat: indirimli fiyat taban altındaysa o, değilse taban. */
export function effectivePrice(p: { basePrice: number; discountedPrice: number | null }) {
  return p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
}

/** Tek ürün kartı — fırsat rafı, kategori ızgarası ve favoriler aynı bileşeni kullanır. */
export default function ProductCard({ product: p, onAdded }: { product: CardProduct; onAdded?: (name: string) => void }) {
  const { add, items } = useCart();
  const { isFav, toggle } = useFavs();

  const eff = effectivePrice(p);
  const discounted = eff < p.basePrice;
  const discPct = discounted ? Math.round((1 - eff / p.basePrice) * 100) : 0;
  const soldOut = p.stockQty != null && p.stockQty <= 0;
  const qty = items.find((i) => i.slug === p.slug && !i.basketSlug)?.qty ?? 0;
  const cartLabel = qty > 0 ? `${qty} ${p.unitLabel === 'kg' ? 'kg' : p.unitLabel ?? 'adet'} sepette` : null;

  function addToCart() {
    add({ slug: p.slug, name: p.name, unitPrice: eff, unitLabel: p.unitLabel, emoji: emojiFor(p.slug, p.category?.slug), maxPerOrder: p.maxPerOrder ?? undefined });
    onAdded?.(p.name);
  }

  return (
    <div className="prod" style={soldOut ? { opacity: 0.6 } : undefined}>
      {soldOut ? (
        <span className="pill out">TÜKENDİ</span>
      ) : discounted ? (
        <span className="pill disc">%{discPct} İNDİRİM</span>
      ) : p.freshToday ? (
        <span className="pill fresh" title="Son 24 saatte halden alındı" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="leaf" size={14} /> BUGÜN HALDEN</span>
      ) : p.isFreshDaily ? (
        <span className="pill fresh">GÜNLÜK TAZE</span>
      ) : p.isLocal ? (
        <span className="pill local">YÖRESEL</span>
      ) : null}
      <button className="fav" onClick={() => toggle(p.slug)} aria-label={isFav(p.slug) ? 'Favorilerden çıkar' : 'Favorilere ekle'}><Icon name="star" size={16} style={isFav(p.slug) ? { fill: 'currentColor' } : undefined} /></button>
      <Link href={`/urun/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
        <div className="ph">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.name} loading="lazy" />
          ) : (
            emojiFor(p.slug, p.category?.slug)
          )}
        </div>
        <div className="nm">{p.name}</div>
        <div className="or">{p.originRegion ?? p.category?.name ?? ''}</div>
      </Link>
      <div className="foot">
        <div>
          <div className="pr">
            {tl(eff)} <span className="unit">/{p.unitLabel ?? 'birim'}</span>
          </div>
          {discounted && <s style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{tl(p.basePrice)}</s>}
        </div>
        {!soldOut && <button className="add" onClick={addToCart} aria-label="Sepete ekle">+</button>}
      </div>
      {cartLabel && <div className="incart" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="cart" size={14} /> {cartLabel}</div>}
    </div>
  );
}
