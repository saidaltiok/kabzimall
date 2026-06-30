'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { tl, emojiFor } from '@/lib/format';
import { useCart } from '@/lib/cart';

interface Product {
  slug: string; name: string; saleType: string; unitLabel: string | null;
  imageUrl: string | null; basePrice: number; discountedPrice: number | null; stockQty: number | null; maxPerOrder: number | null; originRegion: string | null;
  isFeatured: boolean; isFreshDaily: boolean; isLocal: boolean;
  category: { slug: string; name: string } | null;
}
interface Category { slug: string; name: string }
interface BasketComponent { slug: string; name: string; unitLabel: string | null; qty: number }
interface Basket {
  slug: string; name: string; imageUrl: string | null; unitLabel: string | null;
  basePrice: number; discountedPrice: number | null; price: number; stockQty: number | null;
  components: BasketComponent[];
}

const CAT_ICON: Record<string, string> = { meyve: '🍑', sebze: '🥬', yag: '🫒', kahvalti: '🧀', yoresel: '🏺' };

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const { add } = useCart();

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    Promise.all([
      apiGet<{ data: Product[] }>('/storefront/products'),
      apiGet<{ data: Category[] }>('/storefront/categories'),
      apiGet<{ data: Basket[] }>('/storefront/baskets'),
    ])
      .then(([p, c, b]) => { setProducts(p.data); setCategories(c.data); setBaskets(b.data); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (cat !== 'all' && p.category?.slug !== cat) return false;
      if (q && !p.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))) return false;
      return true;
    });
  }, [products, cat, q]);

  function effective(p: Product) {
    return p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
  }
  function addToCart(p: Product) {
    add({ slug: p.slug, name: p.name, unitPrice: effective(p), unitLabel: p.unitLabel, emoji: emojiFor(p.slug, p.category?.slug), maxPerOrder: p.maxPerOrder ?? undefined });
    flash(`${p.name} sepete eklendi ✓`);
  }
  function addBasket(b: Basket) {
    // Sepet AYRI BİR ÜRÜN — tek satır olarak, kendi fiyatıyla eklenir.
    add({ slug: b.slug, name: b.name, unitPrice: b.price, unitLabel: b.unitLabel ?? 'paket', emoji: '🧺' });
    flash(`${b.name} sepete eklendi ✓`);
  }

  if (loading) return <div className="loading">Yükleniyor…</div>;
  if (error)
    return <div className="error" style={{ marginTop: 24 }}>Ürünler yüklenemedi: {error}<br />Sunucu çalışıyor mu? (apps/api)</div>;

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <div className="promo">
        <div className="k">Taze · Yöresel</div>
        <div className="t serif">Dalından sofrana, özenle</div>
        <div className="s">Sabah toplanan ürünler, ertesi gün kapında.</div>
      </div>

      <div className="cats">
        <button className={`cat ${cat === 'all' ? 'sel' : ''}`} onClick={() => setCat('all')}>
          <span className="ring">🛒</span>Tümü
        </button>
        {categories.map((c) => (
          <button key={c.slug} className={`cat ${cat === c.slug ? 'sel' : ''}`} onClick={() => setCat(c.slug)}>
            <span className="ring">{CAT_ICON[c.slug] ?? '🧺'}</span>
            {c.name}
          </button>
        ))}
      </div>

      {cat === 'all' && !q && baskets.length > 0 && (
        <>
          <div className="sectit"><h2 className="serif">Hazır sepetler</h2></div>
          <div className="grid">
            {baskets.map((b) => {
              const discounted = b.discountedPrice != null && b.discountedPrice > 0 && b.discountedPrice < b.basePrice;
              return (
                <div className="prod" key={b.slug} style={{ display: 'flex', flexDirection: 'column' }}>
                  {discounted && <span className="pill" style={{ position: 'absolute', top: 16, left: 16, background: 'var(--persimmon)', color: '#fff' }}>%{Math.round((1 - b.price / b.basePrice) * 100)} İNDİRİM</span>}
                  <div className="ph">
                    {b.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.imageUrl} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                    ) : '🧺'}
                  </div>
                  <div className="nm">{b.name}</div>
                  <div className="or" style={{ minHeight: 30 }}>İçinde: {b.components.map((c) => `${c.name} ${c.qty}${c.unitLabel === 'kg' ? 'kg' : ''}`).join(' · ')}</div>
                  <div className="pr">
                    {tl(b.price)}{' '}
                    {discounted && <s style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{tl(b.basePrice)}</s>}
                  </div>
                  <button className="cta" style={{ marginTop: 8, padding: 10, fontSize: 13 }} onClick={() => addBasket(b)}>Sepete ekle</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <input className="search" placeholder="🔍 Domates, çilek, muz…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="sectit"><h2 className="serif">{cat === 'all' ? 'Tüm ürünler' : categories.find((c) => c.slug === cat)?.name}</h2></div>

      {filtered.length === 0 ? (
        <div className="empty"><div className="big">🧺</div><h2 className="serif">Ürün bulunamadı</h2><div>Farklı bir kategori ya da arama dene.</div></div>
      ) : (
        <div className="grid">
          {filtered.map((p) => {
            const soldOut = p.stockQty != null && p.stockQty <= 0;
            const eff = effective(p);
            const discounted = eff < p.basePrice;
            const discPct = discounted ? Math.round((1 - eff / p.basePrice) * 100) : 0;
            return (
              <div className="prod" key={p.slug} style={soldOut ? { opacity: 0.6 } : undefined}>
                {soldOut ? (
                  <span className="pill" style={{ position: 'absolute', top: 16, left: 16, background: '#eee', color: 'var(--muted)' }}>TÜKENDİ</span>
                ) : discounted ? (
                  <span className="pill" style={{ position: 'absolute', top: 16, left: 16, background: 'var(--persimmon)', color: '#fff' }}>%{discPct} İNDİRİM</span>
                ) : p.isFreshDaily ? (
                  <span className="pill fresh">GÜNLÜK TAZE</span>
                ) : p.isLocal ? (
                  <span className="pill local">YÖRESEL</span>
                ) : null}
                {!soldOut && (
                  <button className="add" onClick={() => addToCart(p)} aria-label="Sepete ekle">+</button>
                )}
                <Link href={`/urun/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="ph">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                    ) : (
                      emojiFor(p.slug, p.category?.slug)
                    )}
                  </div>
                  <div className="nm">{p.name}</div>
                  <div className="or">{p.originRegion ?? '—'}</div>
                  <div className="pr">
                    {tl(eff)}{' '}
                    {discounted && <s style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{tl(p.basePrice)}</s>}
                  </div>
                  <div className="unit">/ {p.unitLabel ?? 'birim'}</div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
