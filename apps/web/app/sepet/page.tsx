'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';

interface StoreSettings { minOrderTotal: number; deliveryFee: number; freeDeliveryThreshold: number }

export default function CartPage() {
  const { items, setQty, setNote, remove, subtotal, keyOf } = useCart();
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings>({ minOrderTotal: 0, deliveryFee: 4990, freeDeliveryThreshold: 40000 });

  useEffect(() => {
    apiGet<StoreSettings>('/storefront/settings').then(setSettings).catch(() => {});
  }, []);

  if (items.length === 0)
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <h2 className="serif">Sepetin boş</h2>
        <div>Taze ürünleri keşfetmeye başla.</div>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  const { minOrderTotal, deliveryFee, freeDeliveryThreshold } = settings;
  const freeEligible = freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold;
  const fee = freeEligible ? 0 : deliveryFee;
  const remaining = freeDeliveryThreshold - subtotal;
  const belowMin = minOrderTotal > 0 && subtotal < minOrderTotal;

  return (
    <>
      <h1 className="h1">Sepetim</h1>
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
          <div className="ln">
            <span>Teslimat</span>
            <span className="save">{fee === 0 ? 'Ücretsiz 🎉' : tl(fee)}</span>
          </div>
          <div className="ln tot serif"><span>Toplam (tahmini)</span><span>{tl(subtotal + fee)}</span></div>
          <div className="note">
            {freeDeliveryThreshold > 0 && (freeEligible
              ? `${tl(freeDeliveryThreshold)} üstü teslimat ücretsiz. `
              : `${tl(remaining)} daha ekle, teslimat ücretsiz olsun. `)}
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
