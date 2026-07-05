'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, savedCoupon, saveCoupon, clearCoupon } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';
import { DEFAULT_SETTINGS, type StoreSettings, feeForSubtotal, nextTier } from '@/lib/delivery';

export default function CartPage() {
  const { items, setQty, setNote, remove, clear, subtotal, keyOf } = useCart();
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  // Kupon — doğrulama ve indirim SUNUCUDA (storefront/coupons/check).
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; message: string } | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    apiGet<StoreSettings>('/storefront/settings').then(setSettings).catch(() => {});
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
        <div className="big">🧺</div>
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
          🗑 Sepeti boşalt
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
                      placeholder="📝 Ürün notu (ör. çok olgun olmasın)"
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
            <span className="save">{fee === 0 ? 'Ücretsiz 🎉' : tl(fee)}</span>
          </div>
          <div className="ln tot serif"><span>Toplam (tahmini)</span><span>{tl(subtotal - (coupon?.discount ?? 0) + fee)}</span></div>
          {!coupon && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input className="notein" style={{ flex: 1, marginTop: 0 }} placeholder="🎟️ Kupon kodu" value={couponInput}
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
              ⚠️ Asgari sipariş tutarı {tl(minOrderTotal)}. {tl(minOrderTotal - subtotal)} daha eklemelisin.
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
