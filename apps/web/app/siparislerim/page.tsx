'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { tl } from '@/lib/format';
import { getOrderHistory } from '@/lib/orders';

interface Order { id: string; code: string; status: string; grandTotal: number; deliveryWindow: string | null }

const LABEL: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    const refs = getOrderHistory();
    if (refs.length === 0) { setOrders([]); return; }
    Promise.all(refs.map((r) => apiGet<Order>(`/storefront/orders/${r.id}`).catch(() => null)))
      .then((list) => setOrders(list.filter(Boolean) as Order[]));
  }, []);

  if (!orders) return <div className="loading">Yükleniyor…</div>;

  if (orders.length === 0)
    return (
      <div className="empty">
        <div className="big">📦</div>
        <h2 className="serif">Henüz siparişin yok</h2>
        <div>İlk siparişini ver, burada görünsün.</div>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  return (
    <>
      <h1 className="h1">Siparişlerim</h1>
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
