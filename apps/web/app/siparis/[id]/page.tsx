'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { tl, emojiFor } from '@/lib/format';
import { useCart } from '@/lib/cart';
import OrderTimeline from '@/components/OrderTimeline';

interface OrderItem { id: string; productName: string; orderedQty: number; unitLabel: string | null; lineTotal: number; note: string | null; product: { slug: string } | null }
interface StoreProduct {
  slug: string; name: string; unitLabel: string | null; stockQty: number | null; maxPerOrder: number | null;
  basePrice: number; discountedPrice: number | null; category: { slug: string } | null;
}
interface Order {
  id: string; code: string; status: string; customerName: string; addressText: string;
  deliveryDate: string | null; deliveryWindow: string | null;
  subtotal: number; deliveryFee: number; grandTotal: number; finalTotal: number | null; items: OrderItem[];
  notifications: { id: string; message: string; createdAt: string }[];
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[];
}

const STATUS: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

const CANCELLABLE = ['CONFIRMED', 'PREPARING'];

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { add } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Order>(`/storefront/orders/${params.id}`).then(setOrder).catch((e) => setError(e.message));
  }, [params.id]);

  async function cancelOrder() {
    if (!window.confirm('Siparişini iptal etmek istediğine emin misin?')) return;
    setCancelling(true);
    setCancelErr(null);
    try {
      const updated = await apiPost<Order>(`/storefront/orders/${params.id}/cancel`, {});
      setOrder(updated);
    } catch (e) {
      setCancelErr((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  /** Geçmiş siparişteki ürünleri güncel fiyat/stokla sepete ekler. */
  async function reorder() {
    if (!order) return;
    setReordering(true);
    setReorderMsg(null);
    const slugs = [...new Set(order.items.map((i) => i.product?.slug).filter(Boolean))] as string[];
    let added = 0;
    let skipped = 0;
    await Promise.all(
      slugs.map(async (slug) => {
        try {
          const p = await apiGet<StoreProduct>(`/storefront/products/${slug}`);
          const soldOut = p.stockQty != null && p.stockQty <= 0;
          if (soldOut) { skipped++; return; }
          const it = order.items.find((x) => x.product?.slug === slug)!;
          const eff = p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
          let qty = it.orderedQty;
          if (p.maxPerOrder != null && qty > p.maxPerOrder) qty = p.maxPerOrder;
          if (p.stockQty != null && qty > p.stockQty) qty = p.stockQty;
          add({ slug: p.slug, name: p.name, unitPrice: eff, unitLabel: p.unitLabel, emoji: emojiFor(p.slug, p.category?.slug), maxPerOrder: p.maxPerOrder ?? undefined }, qty);
          added++;
        } catch {
          skipped++;
        }
      }),
    );
    setReordering(false);
    if (added === 0) { setReorderMsg('Bu siparişteki ürünler şu an satışta değil.'); return; }
    router.push('/sepet');
  }

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
          <div className="ln" key={it.id} style={{ alignItems: 'flex-start' }}>
            <span>
              {it.productName} <span className="muted">· {it.orderedQty} {it.unitLabel ?? ''}</span>
              {it.note && <span className="muted" style={{ display: 'block', fontSize: 12, fontStyle: 'italic' }}>📝 {it.note}</span>}
            </span>
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
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 6 }}>
          {reorderMsg && <div className="error" style={{ marginBottom: 8 }}>{reorderMsg}</div>}
          <button className="cta" style={{ marginTop: 0 }} onClick={reorder} disabled={reordering}>
            {reordering ? 'Sepete ekleniyor…' : '🔁 Aynısını tekrar sipariş ver'}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Ürünler güncel fiyat ve stok durumuyla sepete eklenir.</p>
        </div>
      </div>

      <div className="success-card" style={{ marginTop: 16 }}>
        <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 16 }}>Sipariş durumu</h3>
        <OrderTimeline status={order.status} />
        {order.statusHistory?.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            {order.statusHistory.map((s) => (
              <div key={s.id} className="ln" style={{ alignItems: 'flex-start', fontSize: 13 }}>
                <span>{STATUS[s.toStatus] ?? s.toStatus}{s.note ? ` · ${s.note}` : ''}</span>
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(s.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
        {CANCELLABLE.includes(order.status) && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            {cancelErr && <div className="error" style={{ marginBottom: 8 }}>{cancelErr}</div>}
            <button className="rm" onClick={cancelOrder} disabled={cancelling}>
              {cancelling ? 'İptal ediliyor…' : 'Siparişi iptal et'}
            </button>
            <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Hazırlanmaya başlamadan önce iptal edebilirsin.</span>
          </div>
        )}
      </div>

      {order.notifications.length > 0 && (
        <div className="success-card" style={{ marginTop: 16 }}>
          <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 16 }}>Bildirimler</h3>
          {order.notifications.map((n) => (
            <div key={n.id} className="ln" style={{ alignItems: 'flex-start' }}>
              <span>🔔 {n.message}</span>
              <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(n.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ textAlign: 'center', marginTop: 22 }}>
        <Link href="/siparislerim" className="back">Siparişlerim</Link>　·
        <Link href="/" className="back">Alışverişe devam et →</Link>
      </p>
    </div>
  );
}
