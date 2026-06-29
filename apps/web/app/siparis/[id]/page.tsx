'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { tl } from '@/lib/format';
import OrderTimeline from '@/components/OrderTimeline';

interface OrderItem { id: string; productName: string; orderedQty: number; unitLabel: string | null; lineTotal: number }
interface Order {
  id: string; code: string; status: string; customerName: string; addressText: string;
  deliveryDate: string | null; deliveryWindow: string | null;
  subtotal: number; deliveryFee: number; grandTotal: number; finalTotal: number | null; items: OrderItem[];
}

const STATUS: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Order>(`/storefront/orders/${params.id}`).then(setOrder).catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <div className="error" style={{ marginTop: 24 }}>Sipariş bulunamadı: {error}</div>;
  if (!order) return <div className="loading">Yükleniyor…</div>;

  return (
    <div style={{ padding: '30px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <h1 className="serif" style={{ fontSize: 26, margin: '10px 0 4px' }}>Siparişin alındı!</h1>
        <div className="muted">Sipariş no <b style={{ color: 'var(--ink)' }}>{order.code}</b> · {STATUS[order.status] ?? order.status}</div>
      </div>

      <div className="success-card">
        {order.items.map((it) => (
          <div className="ln" key={it.id}>
            <span>{it.productName} <span className="muted">· {it.orderedQty} {it.unitLabel ?? ''}</span></span>
            <b>{tl(it.lineTotal)}</b>
          </div>
        ))}
        <div className="ln" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 6 }}>
          <span className="muted">Ara toplam</span><span>{tl(order.subtotal)}</span>
        </div>
        <div className="ln"><span className="muted">Teslimat</span><span>{order.deliveryFee === 0 ? 'Ücretsiz' : tl(order.deliveryFee)}</span></div>
        <div className="ln serif" style={{ fontSize: 18, fontWeight: 600 }}>
          <span>{order.finalTotal != null ? 'Tahmini toplam' : 'Toplam (kapıda ödeme)'}</span><span>{tl(order.grandTotal)}</span>
        </div>
        {order.finalTotal != null && (
          <div className="ln serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--forest)' }}>
            <span>Kesinleşen (tartı sonrası)</span><span>{tl(order.finalTotal)}</span>
          </div>
        )}
        {order.deliveryWindow && (
          <div className="ln" style={{ marginTop: 6 }}>
            <span className="muted">Teslimat saati</span>
            <b>{order.deliveryDate?.slice(0, 10)} · {order.deliveryWindow}</b>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Teslimat: <b>{order.customerName}</b> · {order.addressText}. Tartılı ürünlerde nihai tutar
          paketlemede gramajla kesinleşir.
        </p>
      </div>

      <div className="success-card" style={{ marginTop: 16 }}>
        <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 16 }}>Sipariş durumu</h3>
        <OrderTimeline status={order.status} />
      </div>

      <p style={{ textAlign: 'center', marginTop: 22 }}>
        <Link href="/siparislerim" className="back">Siparişlerim</Link>　·
        <Link href="/" className="back">Alışverişe devam et →</Link>
      </p>
    </div>
  );
}
