'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0)
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <h2 className="serif">Sepetin boş</h2>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  async function placeOrder() {
    setBusy(true);
    setError(null);
    try {
      const order = await apiPost<{ id: string }>('/storefront/orders', {
        items: items.map((i) => ({ slug: i.slug, qty: i.qty })),
        customer: { name, phone, address },
        note: note || undefined,
      });
      clear();
      router.push(`/siparis/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const valid = name.trim().length >= 2 && phone.trim().length >= 7 && address.trim().length >= 5;

  return (
    <>
      <h1 className="h1"><Link href="/sepet" className="back">‹</Link> Teslimat & Ödeme</h1>
      <div className="layout2">
        <div>
          <div className="block">
            <h3>Teslimat bilgileri</h3>
            <div className="field"><label>Ad Soyad</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayşe Yılmaz" /></div>
            <div className="field"><label>Telefon</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0555 555 55 55" /></div>
            <div className="field"><label>Adres</label><textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Mahalle, cadde, no, daire — Kadıköy" /></div>
            <div className="field"><label>Sipariş notu (opsiyonel)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zili çalmayın" /></div>
          </div>
          <div className="block">
            <h3>Ödeme yöntemi</h3>
            <div className="choice sel"><div>💵 <b>Kapıda ödeme</b><div className="muted" style={{ fontSize: 12 }}>Nakit / kart</div></div><span>✓</span></div>
            <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>Online ödeme (kart) yakında.</p>
          </div>
        </div>

        <div className="summary">
          <div className="ln"><span>Ara toplam ({items.length} ürün)</span><span>{tl(subtotal)}</span></div>
          <div className="ln"><span>Teslimat</span><span className="save">{subtotal >= 40000 ? 'Ücretsiz' : 'Onayda hesaplanır'}</span></div>
          <div className="ln tot serif"><span>Tahmini toplam</span><span>{tl(subtotal)}+</span></div>
          <div className="note">Kesin tutar (teslimat ücreti dâhil) sipariş onayında gösterilir. Tartılı üründe gramajla kesinleşir.</div>
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          <button className="cta" onClick={placeOrder} disabled={busy || !valid}>
            {busy ? 'Gönderiliyor…' : 'Siparişi onayla'}
          </button>
          {!valid && <p className="note">Ad, telefon ve adresi doldurun.</p>}
        </div>
      </div>
    </>
  );
}
