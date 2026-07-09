'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Modal from './Modal';
import OrderDetail, { type DetailOrder } from './OrderDetail';
import Icon, { type IconName } from './Icon';

interface OrderItem {
  id: string; productName: string; orderedQty: number; pickedQty: number | null; unitLabel: string | null; note: string | null;
  lineTotal: number;
  product?: { stockQty: number | null; substitutes: { substitute: { name: string; stockQty: number | null; isActive: boolean } }[] } | null;
}
interface Order {
  id: string; code: string; customerName: string; customerPhone: string; customerEmail: string | null;
  addressText: string | null; lat: number | null; lng: number | null;
  status: string; subtotal: number; deliveryFee: number; discountTotal: number; couponCode: string | null;
  grandTotal: number; estimatedTotal: number; finalTotal: number | null; note: string | null;
  substitutionPref: string;
  deliveryDate: string | null; deliveryWindow: string | null;
  slotChangeStatus: string | null; slotChangeDate: string | null; slotChangeWindow: string | null;
  createdAt: string; items: OrderItem[];
  notifications: { id: string; message: string; createdAt: string }[];
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; changedBy: string | null; note: string | null; createdAt: string }[];
}

/** Müşterinin "ürün eksik çıkarsa" tercihi — paketlerken uyulacak kural. */
const SUB_LABEL: Record<string, string> = {
  CALL: 'Eksikte: müşteriyi ara',
  REMOVE: 'Eksikte: ürünü çıkar',
  SUBSTITUTE: 'Eksikte: benzeriyle değiştir',
};

/** Operasyon akışı (soldan sağa ilerler). İptal ayrı tutulur. */
const FLOW: [string, string, IconName][] = [
  ['CONFIRMED', 'Onaylandı', 'info'],
  ['PREPARING', 'Hazırlanıyor', 'basket'],
  ['READY', 'Hazır', 'check'],
  ['OUT_FOR_DELIVERY', 'Yolda', 'truck'],
  ['DELIVERED', 'Teslim edildi', 'home'],
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
  const [detailId, setDetailId] = useState<string | null>(null); // pano detay pop-up'ı
  const [slotBusy, setSlotBusy] = useState(false);

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

  async function decideSlot(id: string, approve: boolean) {
    setSlotBusy(true);
    try {
      await apiSend('POST', `/admin/orders/${id}/slot-change`, { approve });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSlotBusy(false);
    }
  }

  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const detailOrder = orders.find((o) => o.id === detailId) ?? null;

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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={icon} size={16} /> {label}</span>
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
                        <button
                          type="button"
                          className="oc-code"
                          onClick={() => setDetailId(o.id)}
                          title="Sipariş detayını aç"
                        >
                          {o.code} <span className="oc-detail">detay ›</span>
                        </button>
                        <span className="oc-amt">{tl(o.finalTotal ?? o.grandTotal)}</span>
                      </div>
                      <div className="oc-cust">{o.customerName} · <span className="muted">{o.customerPhone}</span></div>
                      <div className="oc-meta">
                        {o.items.length} kalem
                        {o.deliveryWindow && <> · {o.deliveryDate?.slice(5, 10).replace('-', '.')} {o.deliveryWindow}</>}
                        {hasNote && <span className="oc-note" title="Müşteri notu var" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="edit" size={14} /></span>}
                        {o.slotChangeStatus === 'PENDING' && (
                          <span className="oc-slot" title={`Saat değişikliği talebi: ${o.slotChangeDate?.slice(5, 10).replace('-', '.')} ${o.slotChangeWindow}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="clock" size={13} /> saat talebi
                          </span>
                        )}
                      </div>
                      <div className="oc-items">{o.items.map((it) => `${it.productName} ${it.orderedQty}${it.unitLabel === 'kg' ? 'kg' : ''}`).join(' · ')}</div>

                      {packOpen === o.id ? (
                        <div className="oc-pack">
                          <div className="tagp risk" style={{ marginBottom: 8 }}>{SUB_LABEL[o.substitutionPref] ?? SUB_LABEL.CALL}</div>
                          {o.items.map((it) => (
                            <div className="oc-packrow" key={it.id}>
                              <span>
                                {it.productName} <span className="muted">({it.orderedQty} {it.unitLabel ?? ''})</span>
                                {it.note && <em style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="edit" size={13} /> {it.note}</em>}
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
                            <button className="btn" disabled={busy === o.id} onClick={() => pack(o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {busy === o.id ? '…' : <><Icon name="check" size={15} /> Onayla → Hazır</>}
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
                            <button className="btn" disabled={busy === o.id} onClick={() => openPack(o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="basket" size={15} /> Paketle</button>
                          ) : (
                            !isLast && (
                              <button className="btn" disabled={busy === o.id} onClick={() => advance(o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {busy === o.id ? '…' : <><Icon name={FLOW[i + 1][2]} size={15} /> İleri al</>}
                              </button>
                            )
                          )}
                          {status !== 'DELIVERED' && (
                            <button className="btn ghost oc-cancel" disabled={busy === o.id} onClick={() => cancel(o)} title="Siparişi iptal et" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={15} /></button>
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
        <b>Hazırlanıyor</b> kolonunda <b style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="basket" size={13} /> Paketle</b> ile tartılan gramajları girip tutarı kesinleştir
        (sipariş <b>Hazır</b>&apos;a geçer). Karttaki <b>koda tıkla</b> → detay pop-up&apos;ı. Aramak/geçmişe
        bakmak için üstten <b>Liste</b> görünümüne geç. Pano 15 sn&apos;de bir kendini tazeler.
      </p>

      <Modal open={!!detailOrder} onClose={() => setDetailId(null)} title={detailOrder ? `Sipariş ${detailOrder.code}` : ''} sub={detailOrder ? `${detailOrder.items.length} kalem · ${tl(detailOrder.finalTotal ?? detailOrder.grandTotal)}` : undefined}>
        {detailOrder && (
          <OrderDetail
            order={detailOrder as DetailOrder}
            busy={slotBusy}
            onSlotDecide={(approve) => decideSlot(detailOrder.id, approve)}
            onAddNote={async (note) => { try { await apiSend('POST', `/admin/orders/${detailOrder.id}/note`, { note }); await load(); } catch (e) { setError((e as Error).message); } }}
            onRefund={async (dto) => { try { await apiSend('POST', `/admin/orders/${detailOrder.id}/refund`, dto); await load(); } catch (e) { setError((e as Error).message); } }}
          />
        )}
      </Modal>
    </>
  );
}
