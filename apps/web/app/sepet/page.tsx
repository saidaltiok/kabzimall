'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, savedCoupon, saveCoupon, clearCoupon } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';
import { DEFAULT_SETTINGS, type StoreSettings, feeForSubtotal, nextTier } from '@/lib/delivery';
import { emojiFor } from '@/lib/format';
import Icon from '@/components/Icon';

interface SuggestProduct {
  slug: string; name: string; unitLabel: string | null; imageUrl: string | null;
  basePrice: number; discountedPrice: number | null; stockQty: number | null; maxPerOrder: number | null;
  category: { slug: string } | null;
}

export default function CartPage() {
  const { items, setQty, setNote, remove, clear, subtotal, keyOf, add } = useCart();
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  // Kupon — doğrulama ve indirim SUNUCUDA (storefront/coupons/check).
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; message: string } | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [suggest, setSuggest] = useState<SuggestProduct[]>([]);

  useEffect(() => {
    apiGet<StoreSettings>('/storefront/settings').then(setSettings).catch(() => {});
    // "Sepetini tamamla": indirimli + düşük fiyatlı tamamlayıcılar (maydanoz/limon sınıfı).
    apiGet<{ data: SuggestProduct[] }>('/storefront/products').then((r) => {
      const pool = r.data.filter((p) => !(p.stockQty != null && p.stockQty <= 0));
      const discounted = pool.filter((p) => p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice);
      const cheap = pool.filter((p) => p.basePrice <= 8000 && !discounted.includes(p)); // ≤80₺
      setSuggest([...discounted, ...cheap]);
    }).catch(() => {});
  }, []);

  // Kayıtlı kupon varsa güncel ara toplamla yeniden doğrula (sepet değişmiş olabilir).
  useEffect(() => {
    const code = savedCoupon();
    if (!code || subtotal <= 0) { if (!code) setCoupon(null); return; }
    apiGet<{ valid: boolean; code: string; discount: number; message: string }>(
      `/storefront/coupons/check?code=${encodeURIComponent(code)}&subtotal=${subtotal}`,
    ).then((r) => {
      if (r.valid) setCoupon({ code: r.code, discount: r.discount, message: r.message });
      else { setCoupon(null); setCouponErr(r.message); clearCoupon(); }
    }).catch(() => {});
  }, [subtotal]);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setCouponBusy(true); setCouponErr(null);
    try {
      const r = await apiGet<{ valid: boolean; code: string; discount: number; message: string }>(
        `/storefront/coupons/check?code=${encodeURIComponent(couponInput.trim())}&subtotal=${subtotal}`,
      );
      if (r.valid) { setCoupon({ code: r.code, discount: r.discount, message: r.message }); saveCoupon(r.code); setCouponInput(''); }
      else setCouponErr(r.message);
    } catch (e) {
      setCouponErr((e as Error).message);
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() { setCoupon(null); clearCoupon(); }

  if (items.length === 0)
    return (
      <div className="empty">
        <div className="big"><Icon name="basket" size={44} /></div>
        <h2 className="serif">Sepetin boş</h2>
        <div>Taze ürünleri keşfetmeye başla.</div>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  const { minOrderTotal, deliveryTiers } = settings;
  const fee = feeForSubtotal(subtotal, deliveryTiers);
  const next = nextTier(subtotal, deliveryTiers);
  const belowMin = minOrderTotal > 0 && subtotal < minOrderTotal;

  return (
    <>
      <h1 className="h1" style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        Sepetim
        <button
          className="back"
          style={{ marginLeft: 'auto', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--berry)' }}
          onClick={() => { if (confirm('Sepetteki tüm ürünler kaldırılacak. Emin misiniz?')) clear(); }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="trash" size={15} /> Sepeti boşalt</span>
        </button>
      </h1>
      <div className="layout2">
        <div>
          {items.map((it) => {
            const step = it.unitLabel === 'kg' ? 0.5 : 1;
            const k = keyOf(it.slug, it.basketSlug);
            return (
              <div className="citem" key={k}>
                <div className="ph">{it.emoji}</div>
                <div>
                  <div className="nm">
                    {it.name}
                    {it.basketSlug && <span className="pill local" style={{ marginLeft: 6, fontSize: 9 }}>{it.basketName ?? 'sepet'}</span>}
                  </div>
                  <div className="meta">{tl(it.unitPrice)} / {it.unitLabel ?? 'birim'}{it.basketSlug ? ' · paket fiyatı' : ''}</div>
                  <div className="pr">{tl(Math.round(it.unitPrice * it.qty))}</div>
                  {!it.basketSlug && (
                    <input
                      className="notein"
                      placeholder="Ürün notu (ör. çok olgun olmasın)"
                      defaultValue={it.note ?? ''}
                      onBlur={(e) => setNote(k, e.target.value)}
                    />
                  )}
                </div>
                <div className="qbox">
                  <button onClick={() => setQty(k, +(it.qty - step).toFixed(3))}>−</button>
                  <b>{it.qty} {it.unitLabel === 'kg' ? 'kg' : ''}</b>
                  <button disabled={it.maxPerOrder != null && it.qty >= it.maxPerOrder} onClick={() => setQty(k, +(it.qty + step).toFixed(3))}>+</button>
                </div>
                {it.maxPerOrder != null && it.qty >= it.maxPerOrder && (
                  <div className="meta" style={{ flexBasis: '100%', color: 'var(--persimmon-d)' }}>Maks {it.maxPerOrder} {it.unitLabel === 'kg' ? 'kg' : 'adet'}</div>
                )}
                <button className="rm" onClick={() => remove(k)}>Kaldır</button>
              </div>
            );
          })}

          {/* Eşik ilerleme çubuğu — bir sonraki teslimat kademesine kalan */}
          {next && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '12px 16px', marginTop: 4, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="truck" size={15} /> {next.fee === 0 ? 'Ücretsiz teslimata' : `${tl(next.fee)} teslimata`} <b style={{ color: 'var(--persimmon-d)' }}>{tl(next.minSubtotal - subtotal)}</b> kaldı</span>
                <span className="muted">{tl(next.minSubtotal)}</span>
              </div>
              <div style={{ background: 'var(--cream-d)', borderRadius: 20, height: 8, overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(90deg, var(--moss), var(--forest))', height: '100%', borderRadius: 20, width: `${Math.min(100, Math.round((subtotal / next.minSubtotal) * 100))}%`, transition: 'width .3s' }} />
              </div>
            </div>
          )}

          {/* Sepetini tamamla — indirimli/küçük tamamlayıcılar */}
          {(() => {
            const inCart = new Set(items.map((i) => i.slug));
            const strip = suggest.filter((p) => !inCart.has(p.slug)).slice(0, 6);
            if (strip.length === 0) return null;
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Sepetini tamamla</div>
                <div className="rail" style={{ paddingBottom: 8 }}>
                  {strip.map((p) => {
                    const eff = p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
                    return (
                      <div key={p.slug} style={{ flex: '0 0 130px', background: '#fff', borderRadius: 14, padding: 10, boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
                        <div style={{ height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt={p.name} style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10 }} />
                          ) : emojiFor(p.slug, p.category?.slug)}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--forest)', fontWeight: 700 }}>
                          {tl(eff)}{eff < p.basePrice && <s className="muted" style={{ fontWeight: 400, marginLeft: 4, fontSize: 10.5 }}>{tl(p.basePrice)}</s>}
                        </div>
                        <button
                          className="btnmini"
                          style={{ marginTop: 6, width: '100%', border: '1.5px solid var(--forest)', background: 'none', color: 'var(--forest)', borderRadius: 10, padding: '5px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          onClick={() => add({ slug: p.slug, name: p.name, unitPrice: eff, unitLabel: p.unitLabel, emoji: emojiFor(p.slug, p.category?.slug), maxPerOrder: p.maxPerOrder ?? undefined })}
                        >
                          + Ekle
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="summary">
          <div className="ln"><span>Ara toplam</span><span>{tl(subtotal)}</span></div>
          {coupon && (
            <div className="ln">
              <span>Kupon <b>{coupon.code}</b> <button onClick={removeCoupon} style={{ border: 'none', background: 'none', color: 'var(--berry)', cursor: 'pointer', fontSize: 12 }}>kaldır</button></span>
              <span className="save">−{tl(coupon.discount)}</span>
            </div>
          )}
          <div className="ln">
            <span>Teslimat</span>
            <span className="save">{fee === 0 ? 'Ücretsiz' : tl(fee)}</span>
          </div>
          <div className="ln tot serif"><span>Toplam (tahmini)</span><span>{tl(subtotal - (coupon?.discount ?? 0) + fee)}</span></div>
          {!coupon && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input className="notein" style={{ flex: 1, marginTop: 0 }} placeholder="Kupon kodu" value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCoupon()} />
              <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '8px 14px', fontSize: 13 }} disabled={couponBusy || !couponInput.trim()} onClick={applyCoupon}>
                {couponBusy ? '…' : 'Uygula'}
              </button>
            </div>
          )}
          {couponErr && <div className="note" style={{ color: 'var(--berry)' }}>{couponErr}</div>}
          <div className="note">
            {next && (next.fee === 0
              ? `${tl(next.minSubtotal - subtotal)} daha ekle, teslimat ücretsiz olsun. `
              : `${tl(next.minSubtotal - subtotal)} daha ekle, teslimat ${tl(next.fee)}'ye insin. `)}
            Tartılı ürünlerde nihai tutar paketlemede gramajla kesinleşir.
          </div>
          {belowMin && (
            <div className="note" style={{ color: 'var(--honey)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={15} /> Asgari sipariş tutarı {tl(minOrderTotal)}. {tl(minOrderTotal - subtotal)} daha eklemelisin.</span>
            </div>
          )}
          <button className="cta" disabled={belowMin} onClick={() => router.push('/odeme')}>
            {belowMin ? `Asgari ${tl(minOrderTotal)}` : 'Teslimat & ödemeye geç →'}
          </button>
        </div>
      </div>
    </>
  );
}
