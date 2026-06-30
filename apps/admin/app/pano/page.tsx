'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface OrderItem { id: string; productName: string; orderedQty: number; unitLabel: string | null; note: string | null }
interface Order {
  id: string; code: string; customerName: string; customerPhone: string;
  status: string; grandTotal: number; finalTotal: number | null; note: string | null;
  deliveryDate: string | null; deliveryWindow: string | null;
  createdAt: string; items: OrderItem[];
}

/** Operasyon akışı (soldan sağa ilerler). İptal ayrı tutulur. */
const FLOW: [string, string, string][] = [
  ['CONFIRMED', 'Onaylandı', '🆕'],
  ['PREPARING', 'Hazırlanıyor', '👜'],
  ['READY', 'Hazır', '✅'],
  ['OUT_FOR_DELIVERY', 'Yolda', '🛵'],
  ['DELIVERED', 'Teslim edildi', '🏠'],
];

export default function PanoPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ data: Order[] }>('/admin/orders');
      setOrders(r.data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // 15 sn'de bir tazele
    return () => clearInterval(t);
  }, [load]);

  async function advance(o: Order) {
    const idx = FLOW.findIndex(([s]) => s === o.status);
    const next = FLOW[idx + 1]?.[0];
    if (!next) return;
    setBusy(o.id);
    try {
      await apiSend('PATCH', `/admin/orders/${o.id}/status`, { status: next });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(o: Order) {
    setBusy(o.id);
    try {
      await apiSend('PATCH', `/admin/orders/${o.id}/status`, { status: 'CANCELLED' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const activeTotal = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;

  return (
    <>
      <Topbar title="Operasyon Panosu" sub={`Bugünün akışı · ${activeTotal} aktif sipariş`} />
      <div className="body">
        {error && <div className="error">{error}</div>}

        <div className="board">
          {FLOW.map(([status, label, icon], i) => {
            const col = orders.filter((o) => o.status === status);
            const isLast = i === FLOW.length - 1;
            return (
              <div className="col" key={status}>
                <h3>
                  <span>{icon} {label}</span>
                  <span className="cnt">{col.length}</span>
                </h3>
                {col.length === 0 ? (
                  <div className="colempty">—</div>
                ) : (
                  col.map((o) => {
                    const hasNote = !!o.note || o.items.some((it) => it.note);
                    return (
                      <div className="ocard" key={o.id}>
                        <div className="oc-top">
                          <b>{o.code}</b>
                          <span className="oc-amt">{tl(o.finalTotal ?? o.grandTotal)}</span>
                        </div>
                        <div className="oc-cust">{o.customerName} · <span className="muted">{o.customerPhone}</span></div>
                        <div className="oc-meta">
                          {o.items.length} kalem
                          {o.deliveryWindow && <> · {o.deliveryDate?.slice(5, 10).replace('-', '.')} {o.deliveryWindow}</>}
                          {hasNote && <span className="oc-note" title="Müşteri notu var">📝</span>}
                        </div>
                        <div className="oc-items">{o.items.map((it) => `${it.productName} ${it.orderedQty}${it.unitLabel === 'kg' ? 'kg' : ''}`).join(' · ')}</div>
                        <div className="oc-act">
                          {!isLast && (
                            <button className="btn" disabled={busy === o.id} onClick={() => advance(o)}>
                              {busy === o.id ? '…' : `${FLOW[i + 1][2]} İleri al`}
                            </button>
                          )}
                          {status !== 'DELIVERED' && (
                            <button className="btn ghost oc-cancel" disabled={busy === o.id} onClick={() => cancel(o)} title="Siparişi iptal et">✕</button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>

        {cancelled.length > 0 && (
          <div className="card" style={{ marginTop: 18 }}>
            <div className="ct">İptal edilenler <span>{cancelled.length}</span></div>
            <div className="miniinfo">
              {cancelled.map((o) => (
                <span key={o.id}><b>{o.code}</b> · {o.customerName} · {tl(o.grandTotal)}</span>
              ))}
            </div>
          </div>
        )}

        <p className="note2" style={{ marginTop: 14 }}>
          Tartılı ürünlerde tutar kesinleştirme (paketleme) <Link href="/siparisler" style={{ color: 'var(--forest)', fontWeight: 600 }}>Siparişler</Link> ekranından yapılır. Pano 15 sn&apos;de bir kendini tazeler.
        </p>
      </div>
    </>
  );
}
