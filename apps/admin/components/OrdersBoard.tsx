'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';

interface OrderItem { id: string; productName: string; orderedQty: number; pickedQty: number | null; unitLabel: string | null; note: string | null }
interface Order {
  id: string; code: string; customerName: string; customerPhone: string;
  status: string; grandTotal: number; estimatedTotal: number; finalTotal: number | null; note: string | null;
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

/**
 * Sipariş panosu (kanban) — Siparişler ekranının "Pano" görünümü.
 * Eskiden ayrı "Operasyon Panosu" ekranıydı; aynı işi iki yerde yapmamak için
 * Siparişler'in bir görünümü haline getirildi.
 */
export default function OrdersBoard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [packOpen, setPackOpen] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});

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

  function openPack(o: Order) {
    setPackOpen(packOpen === o.id ? null : o.id);
    setPicks({});
  }

  /** Tartılan gerçek gramajları işle → tutar kesinleşir, sipariş 'Hazır' olur. */
  async function pack(o: Order) {
    setBusy(o.id);
    try {
      const items = o.items.map((it) => ({
        itemId: it.id,
        pickedQty: picks[it.id] !== undefined && picks[it.id] !== '' ? Number(picks[it.id].replace(',', '.')) : it.orderedQty,
      }));
      await apiSend('POST', `/admin/orders/${o.id}/pack`, { items });
      setPackOpen(null);
      setPicks({});
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

  return (
    <>
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

                      {packOpen === o.id ? (
                        <div className="oc-pack">
                          {o.items.map((it) => (
                            <div className="oc-packrow" key={it.id}>
                              <span>
                                {it.productName} <span className="muted">({it.orderedQty} {it.unitLabel ?? ''})</span>
                                {it.note && <em>📝 {it.note}</em>}
                              </span>
                              <input
                                className="cell"
                                placeholder={String(it.orderedQty)}
                                value={picks[it.id] ?? ''}
                                onChange={(e) => setPicks((s) => ({ ...s, [it.id]: e.target.value }))}
                              />
                            </div>
                          ))}
                          <div className="oc-act">
                            <button className="btn" disabled={busy === o.id} onClick={() => pack(o)}>
                              {busy === o.id ? '…' : '✅ Onayla → Hazır'}
                            </button>
                            <button className="btn ghost" disabled={busy === o.id} onClick={() => setPackOpen(null)}>Vazgeç</button>
                          </div>
                          <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                            Boş bırakılan kalem istenen miktarla kapanır. Tahmini: {tl(o.estimatedTotal)}
                          </div>
                        </div>
                      ) : (
                        <div className="oc-act">
                          {status === 'PREPARING' ? (
                            <button className="btn" disabled={busy === o.id} onClick={() => openPack(o)}>⚖️ Paketle</button>
                          ) : (
                            !isLast && (
                              <button className="btn" disabled={busy === o.id} onClick={() => advance(o)}>
                                {busy === o.id ? '…' : `${FLOW[i + 1][2]} İleri al`}
                              </button>
                            )
                          )}
                          {status !== 'DELIVERED' && (
                            <button className="btn ghost oc-cancel" disabled={busy === o.id} onClick={() => cancel(o)} title="Siparişi iptal et">✕</button>
                          )}
                        </div>
                      )}
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
        <b>Hazırlanıyor</b> kolonunda <b>⚖️ Paketle</b> ile tartılan gramajları girip tutarı kesinleştir
        (sipariş <b>Hazır</b>&apos;a geçer). Aramak/geçmişe bakmak için üstten <b>Liste</b> görünümüne geç.
        Pano 15 sn&apos;de bir kendini tazeler.
      </p>
    </>
  );
}
