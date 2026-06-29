'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';

const FREE_THRESHOLD = 40000; // kuruş (400 ₺)

export default function CartPage() {
  const { items, setQty, remove, subtotal, keyOf } = useCart();
  const router = useRouter();

  if (items.length === 0)
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <h2 className="serif">Sepetin boş</h2>
        <div>Taze ürünleri keşfetmeye başla.</div>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  const remaining = FREE_THRESHOLD - subtotal;

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
                </div>
                <div className="qbox">
                  <button onClick={() => setQty(k, +(it.qty - step).toFixed(3))}>−</button>
                  <b>{it.qty} {it.unitLabel === 'kg' ? 'kg' : ''}</b>
                  <button onClick={() => setQty(k, +(it.qty + step).toFixed(3))}>+</button>
                </div>
                <button className="rm" onClick={() => remove(k)}>Kaldır</button>
              </div>
            );
          })}
        </div>

        <div className="summary">
          <div className="ln"><span>Ara toplam</span><span>{tl(subtotal)}</span></div>
          <div className="ln">
            <span>Teslimat</span>
            <span className="save">{subtotal >= FREE_THRESHOLD ? 'Ücretsiz 🎉' : 'Ödeme adımında'}</span>
          </div>
          <div className="ln tot serif"><span>Toplam</span><span>{tl(subtotal)}+</span></div>
          <div className="note">
            {subtotal >= FREE_THRESHOLD
              ? '400 ₺ üstü teslimat ücretsiz.'
              : `${tl(remaining)} daha ekle, teslimat ücretsiz olsun. `}
            Tartılı ürünlerde nihai tutar paketlemede gramajla kesinleşir.
          </div>
          <button className="cta" onClick={() => router.push('/odeme')}>Teslimat & ödemeye geç →</button>
        </div>
      </div>
    </>
  );
}
