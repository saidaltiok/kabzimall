'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import Topbar from '@/components/Topbar';
import OrdersBoard from '@/components/OrdersBoard';

interface OrderItem { id: string; productName: string; orderedQty: number; pickedQty: number | null; unitLabel: string | null; unitPrice: number; lineTotal: number; note: string | null }
interface Order {
  id: string; code: string; customerName: string; customerPhone: string; addressText: string;
  lat: number | null; lng: number | null;
  substitutionPref: string;
  slotChangeDate: string | null; slotChangeWindow: string | null; slotChangeStatus: string | null;
  status: string; subtotal: number; deliveryFee: number; grandTotal: number; note: string | null;
  estimatedTotal: number; finalTotal: number | null;
  deliveryDate: string | null; deliveryWindow: string | null;
  createdAt: string; items: OrderItem[];
  notifications: { id: string; message: string; createdAt: string }[];
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; changedBy: string | null; note: string | null; createdAt: string }[];
}

/** Müşterinin "ürün eksik çıkarsa" tercihi — paketleyicinin uyması gereken kural. */
const SUB_LABEL: Record<string, string> = {
  CALL: '📞 Eksikte: müşteriyi ara',
  REMOVE: '➖ Eksikte: ürünü çıkar',
  SUBSTITUTE: '🔄 Eksikte: benzeriyle değiştir',
};

const STATUSES: [string, string][] = [
  ['CONFIRMED', 'Onaylandı'],
  ['PREPARING', 'Hazırlanıyor'],
  ['READY', 'Hazır'],
  ['OUT_FOR_DELIVERY', 'Yolda'],
  ['DELIVERED', 'Teslim edildi'],
  ['CANCELLED', 'İptal'],
];
const label = (s: string) => STATUSES.find((x) => x[0] === s)?.[1] ?? s;
const cls = (s: string) => (s === 'CANCELLED' ? 'up' : s === 'DELIVERED' ? 'ok' : 'risk');

export default function SiparislerPage() {
  // Pano = günlük operasyon (varsayılan); Liste = arama/geçmiş/detay.
  const [view, setView] = useState<'pano' | 'liste'>('pano');
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      if (search.trim()) params.set('q', search.trim());
      const qs = params.toString();
      const r = await apiGet<{ data: Order[] }>(`/admin/orders${qs ? `?${qs}` : ''}`);
      setOrders(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await apiSend('PATCH', `/admin/orders/${id}/status`, { status });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Bekleyen teslimat saati talebini onayla/reddet — müşteri her iki durumda da bilgilendirilir. */
  async function decideSlot(o: Order, approve: boolean) {
    setError(null);
    try {
      await apiSend('POST', `/admin/orders/${o.id}/slot-change`, { approve });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pack(o: Order) {
    setError(null);
    try {
      const items = o.items
        .map((it) => ({ itemId: it.id, raw: picks[it.id] }))
        .filter((x) => x.raw !== undefined && x.raw !== '')
        .map((x) => ({ itemId: x.itemId, pickedQty: Number(x.raw!.replace(',', '.')) }));
      if (items.length === 0) {
        setError('En az bir kalem için tartılan miktar girin.');
        return;
      }
      await apiSend('POST', `/admin/orders/${o.id}/pack`, { items });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Topbar title="Siparişler" sub="Bugünün operasyonu" />
      <div className="body">
        <div className="form-row" style={{ marginBottom: 14, alignItems: 'center' }}>
          <div className="pchips" style={{ margin: 0 }}>
            <div className={`pchip${view === 'pano' ? ' sel' : ''}`} onClick={() => setView('pano')} title="Günlük akış: siparişleri kolonlar arasında ilerlet">
              <span className="e">📋</span> Pano
            </div>
            <div className={`pchip${view === 'liste' ? ' sel' : ''}`} onClick={() => setView('liste')} title="Ara, filtrele, geçmişe ve detaya bak">
              <span className="e">☰</span> Liste
            </div>
          </div>
        </div>

        {view === 'pano' ? (
          <OrdersBoard />
        ) : (
          <>
        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Durum filtresi</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Tümü</option>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Ara (kod / müşteri / telefon)</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="KM… · Ayşe · 0555…" style={{ minWidth: 220 }} />
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">Siparişler <span>{orders.length}</span></div>
          {orders.length === 0 ? (
            <p className="muted">Sipariş yok.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>No</th><th>Müşteri</th><th className="num">Kalem</th>
                  <th className="num">Ara toplam</th><th className="num">Teslimat</th><th className="num">Toplam</th>
                  <th>Durum</th><th>Zaman</th><th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <Fragment key={o.id}>
                    <tr>
                      <td><b>{o.code}</b>{o.slotChangeStatus === 'PENDING' && <span title="Bekleyen teslimat saati talebi" style={{ marginLeft: 5 }}>🕒</span>}</td>
                      <td>{o.customerName}<div className="muted" style={{ fontSize: 11 }}>{o.customerPhone}</div></td>
                      <td className="num">{o.items.length}</td>
                      <td className="num">{tl(o.subtotal)}</td>
                      <td className="num">{o.deliveryFee === 0 ? 'Ücretsiz' : tl(o.deliveryFee)}</td>
                      <td className="num savecell">{tl(o.grandTotal)}</td>
                      <td><span className={`tagp ${cls(o.status)}`}>{label(o.status)}</span></td>
                      <td className="muted" style={{ fontSize: 11 }}>{dt(o.createdAt)}</td>
                      <td className="num">
                        <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)} style={{ fontSize: 11, padding: '5px 7px' }}>
                          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button className="btn ghost" style={{ fontSize: 11, padding: '5px 9px', marginLeft: 6 }} onClick={() => setOpen(open === o.id ? null : o.id)}>
                          {open === o.id ? 'Gizle' : 'Detay'}
                        </button>
                      </td>
                    </tr>
                    {open === o.id && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--cream)' }}>
                          <div style={{ padding: '4px 2px' }}>
                            {o.deliveryWindow && <><b>Teslimat:</b> {o.deliveryDate?.slice(0, 10)} · {o.deliveryWindow} · </>}
                            <span className="tagp risk" style={{ marginRight: 8 }}>{SUB_LABEL[o.substitutionPref] ?? SUB_LABEL.CALL}</span>
                            <b>Adres:</b> {o.addressText}
                            {o.lat != null && o.lng != null ? (
                              <> · 📍 <a href={`https://www.google.com/maps?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--forest)', fontWeight: 600 }}>Haritada gör / yol tarifi</a></>
                            ) : (
                              <> · <span className="muted">📍 harita konumu yok</span></>
                            )}
                            {o.note && <> · <b>Not:</b> {o.note}</>}
                            {o.slotChangeStatus === 'PENDING' && (
                              <div style={{ margin: '10px 0', padding: '8px 10px', background: '#fff7ed', border: '1px solid var(--honey)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span>🕒 <b>Saat değişikliği talebi:</b> {o.deliveryDate?.slice(0, 10)} {o.deliveryWindow} → <b>{o.slotChangeDate?.slice(0, 10)} {o.slotChangeWindow}</b></span>
                                <button className="btn" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => decideSlot(o, true)}>✓ Onayla</button>
                                <button className="btn ghost" style={{ fontSize: 12, padding: '5px 12px', color: 'var(--berry)' }} onClick={() => decideSlot(o, false)}>✕ Reddet</button>
                                <span className="muted" style={{ fontSize: 11 }}>İki durumda da müşteri bilgilendirilir.</span>
                              </div>
                            )}
                            <table style={{ marginTop: 8, background: '#fff', borderRadius: 10 }}>
                              <thead>
                                <tr>
                                  <th>Ürün</th><th className="num">İstenen</th>
                                  <th className="num">Tartılan</th><th className="num">Satır</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((it) => (
                                  <tr key={it.id}>
                                    <td>
                                      {it.productName}
                                      {it.note && <div style={{ fontSize: 11, color: 'var(--persimmon-d)', fontStyle: 'italic' }}>📝 {it.note}</div>}
                                    </td>
                                    <td className="num">{it.orderedQty} {it.unitLabel ?? ''}</td>
                                    <td className="num">
                                      <input
                                        className="cell" style={{ width: 70 }}
                                        placeholder={String(it.pickedQty ?? it.orderedQty)}
                                        value={picks[it.id] ?? ''}
                                        onChange={(e) => setPicks((s) => ({ ...s, [it.id]: e.target.value }))}
                                      />
                                    </td>
                                    <td className="num savecell">{tl(it.lineTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                              <button className="btn" onClick={() => pack(o)}>Paketle (tutarı kesinleştir)</button>
                              <span className="muted" style={{ fontSize: 12 }}>
                                Tahmini: <b>{tl(o.estimatedTotal)}</b>
                                {o.finalTotal != null && <> · Kesinleşen: <b style={{ color: 'var(--forest)' }}>{tl(o.finalTotal)}</b></>}
                              </span>
                            </div>
                            {o.notifications.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <b style={{ fontSize: 12 }}>Gönderilen bildirimler:</b>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
                                  {o.notifications.map((n) => <li key={n.id}>🔔 {n.message}</li>)}
                                </ul>
                              </div>
                            )}
                            {o.statusHistory?.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <b style={{ fontSize: 12 }}>Durum geçmişi:</b>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
                                  {o.statusHistory.map((s) => (
                                    <li key={s.id}>
                                      {s.fromStatus ? `${label(s.fromStatus)} → ` : ''}<b>{label(s.toStatus)}</b>
                                      {s.changedBy ? ` · ${s.changedBy}` : ''} · {dt(s.createdAt)}
                                      {s.note ? ` · ${s.note}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
          </>
        )}
      </div>
    </>
  );
}
