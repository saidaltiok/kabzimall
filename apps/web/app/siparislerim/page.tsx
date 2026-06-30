'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { tl } from '@/lib/format';
import { getOrderHistory, rememberOrder } from '@/lib/orders';

interface Order { id: string; code: string; status: string; grandTotal: number; deliveryWindow: string | null }

const LABEL: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const router = useRouter();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);

  useEffect(() => {
    const refs = getOrderHistory();
    if (refs.length === 0) { setOrders([]); return; }
    Promise.all(refs.map((r) => apiGet<Order>(`/storefront/orders/${r.id}`).catch(() => null)))
      .then((list) => setOrders(list.filter(Boolean) as Order[]));
  }, []);

  async function lookup() {
    setBusy(true);
    setLookupErr(null);
    try {
      const o = await apiGet<Order>(`/storefront/orders/lookup?code=${encodeURIComponent(code.trim())}&phone=${encodeURIComponent(phone.trim())}`);
      rememberOrder(o.id, o.code);
      router.push(`/siparis/${o.id}`);
    } catch {
      setLookupErr('Sipariş bulunamadı. Kod ve telefonu kontrol edin.');
    } finally {
      setBusy(false);
    }
  }

  const lookupForm = (
    <div className="block" style={{ maxWidth: 460, margin: '0 auto 22px' }}>
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 16 }}>Sipariş takibi</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>Başka cihazdan mı bakıyorsun? Sipariş kodu ve telefonunla sorgula.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="search" style={{ flex: 1, minWidth: 120 }} placeholder="Sipariş kodu (KM…)" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="search" style={{ flex: 1, minWidth: 120 }} placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code && phone && lookup()} />
      </div>
      {lookupErr && <div className="error" style={{ marginTop: 10 }}>{lookupErr}</div>}
      <button className="cta" style={{ marginTop: 12 }} disabled={busy || !code.trim() || !phone.trim()} onClick={lookup}>
        {busy ? 'Sorgulanıyor…' : 'Siparişi sorgula'}
      </button>
    </div>
  );

  if (!orders) return <div className="loading">Yükleniyor…</div>;

  if (orders.length === 0)
    return (
      <>
        <h1 className="h1">Siparişlerim</h1>
        {lookupForm}
        <div className="empty" style={{ paddingTop: 20 }}>
          <div className="big">📦</div>
          <h2 className="serif">Bu cihazda kayıtlı sipariş yok</h2>
          <div>İlk siparişini ver ya da yukarıdan kod + telefonla sorgula.</div>
          <p><Link href="/" className="back">← Alışverişe başla</Link></p>
        </div>
      </>
    );

  return (
    <>
      <h1 className="h1">Siparişlerim</h1>
      {lookupForm}
      {orders.map((o) => {
        const cls = o.status === 'DELIVERED' ? 'done' : o.status === 'CANCELLED' ? 'cancel' : '';
        return (
          <Link href={`/siparis/${o.id}`} key={o.id}>
            <div className="orow">
              <div style={{ fontSize: 26 }}>🧾</div>
              <div>
                <div style={{ fontWeight: 600 }}>{o.code}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {o.deliveryWindow ? `Teslimat: ${o.deliveryWindow}` : 'Kapıda ödeme'} · {tl(o.grandTotal)}
                </div>
              </div>
              <span className={`statusbadge ${cls}`} style={{ marginLeft: 'auto' }}>{LABEL[o.status] ?? o.status}</span>
            </div>
          </Link>
        );
      })}
      <p style={{ marginTop: 16 }}><Link href="/" className="back">← Alışverişe devam et</Link></p>
    </>
  );
}
