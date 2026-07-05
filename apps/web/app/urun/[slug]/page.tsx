'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { tl, emojiFor } from '@/lib/format';
import { useCart } from '@/lib/cart';

interface Substitute {
  slug: string; name: string; unitLabel: string | null; imageUrl: string | null;
  basePrice: number; discountedPrice: number | null;
}
interface Product {
  slug: string; name: string; unitLabel: string | null; imageUrl: string | null;
  stockQty: number | null; maxPerOrder: number | null; basePrice: number; discountedPrice: number | null; originRegion: string | null;
  description: string | null;
  isFreshDaily: boolean; isLocal: boolean; category: { slug: string; name: string } | null;
  substitutes: Substitute[];
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { add } = useCart();
  const [p, setP] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    apiGet<Product>(`/storefront/products/${slug}`).then(setP).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="error" style={{ marginTop: 24 }}>Ürün bulunamadı: {error}</div>;
  if (!p) return <div className="loading">Yükleniyor…</div>;

  const eff = p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
  const discounted = eff < p.basePrice;
  const soldOut = p.stockQty != null && p.stockQty <= 0;
  const step = p.unitLabel === 'kg' ? 0.5 : 1;
  const max = p.maxPerOrder ?? undefined;
  const atMax = max != null && qty >= max;

  function addToCart() {
    if (!p) return;
    add({ slug: p.slug, name: p.name, unitPrice: eff, unitLabel: p.unitLabel, emoji: emojiFor(p.slug, p.category?.slug), note: note.trim() || undefined, maxPerOrder: max }, qty);
    router.push('/sepet');
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <p style={{ margin: '18px 0 8px' }}><Link href="/" className="back">← Vitrine dön</Link></p>

      <div className="layout2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="prod" style={{ padding: 16 }}>
          <div className="ph" style={{ height: 280, fontSize: 120 }}>
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
            ) : emojiFor(p.slug, p.category?.slug)}
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>
            {p.isFreshDaily && <span className="pill fresh">GÜNLÜK TAZE</span>}{' '}
            {p.isLocal && <span className="pill local">YÖRESEL</span>}
          </div>
          <h1 className="serif" style={{ fontSize: 30, margin: '4px 0 2px' }}>{p.name}</h1>
          <div className="muted" style={{ marginBottom: 14 }}>
            {p.originRegion ?? '—'}{p.category ? ` · ${p.category.name}` : ''} · özenle seçilir
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span className="serif" style={{ fontSize: 30, color: 'var(--forest)', fontWeight: 600 }}>{tl(eff)}</span>
            {discounted && <s className="muted">{tl(p.basePrice)}</s>}
            {discounted && <span className="pill" style={{ background: 'var(--persimmon)', color: '#fff' }}>%{Math.round((1 - eff / p.basePrice) * 100)}</span>}
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 18 }}>/ {p.unitLabel ?? 'birim'}</div>

          {p.description && (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink, #26241f)', marginBottom: 18 }}>{p.description}</p>
          )}

          {soldOut ? (
            <>
              <div className="error">Bu ürün şu an tükendi.</div>
              {p.substitutes.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Yerine şunlara bakabilirsin:</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {p.substitutes.map((s) => {
                      const se = s.discountedPrice != null && s.discountedPrice > 0 && s.discountedPrice < s.basePrice ? s.discountedPrice : s.basePrice;
                      return (
                        <Link key={s.slug} href={`/urun/${s.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 14, border: '1.5px solid var(--line)', background: '#fff', textDecoration: 'none', color: 'inherit' }}>
                          <span style={{ fontSize: 20 }}>
                            {s.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.imageUrl} alt={s.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 8 }} />
                            ) : emojiFor(s.slug, p.category?.slug)}
                          </span>
                          <span>
                            <b style={{ fontSize: 13 }}>{s.name}</b>
                            <div className="muted" style={{ fontSize: 11.5 }}>{tl(se)} / {s.unitLabel ?? 'birim'}</div>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="block" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
                <label className="muted" style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Ürün notu (opsiyonel)</label>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder='Örn: "Çok olgun olmasın, biraz sert olsun" — paketleyene iletilir' style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                <div className="qbox">
                  <button onClick={() => setQty((q) => Math.max(step, +(q - step).toFixed(3)))}>−</button>
                  <b>{qty} {p.unitLabel === 'kg' ? 'kg' : 'adet'}</b>
                  <button disabled={atMax} onClick={() => setQty((q) => (max != null ? Math.min(max, +(q + step).toFixed(3)) : +(q + step).toFixed(3)))}>+</button>
                </div>
                <button className="cta" style={{ flex: 1, marginTop: 0 }} onClick={addToCart}>
                  Sepete ekle · {tl(Math.round(eff * qty))}
                </button>
              </div>
              {max != null && (
                <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  ⛔ Sipariş başına en fazla {max} {p.unitLabel === 'kg' ? 'kg' : 'adet'} alınabilir.
                </p>
              )}
              {p.unitLabel === 'kg' && (
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  ⚖️ Tartılı üründe nihai tutar paketlemede gerçek gramajla kesinleşir.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
