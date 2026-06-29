'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface OrderItem { id: string; productName: string; orderedQty: number; unitLabel: string | null; lineTotal: number }
interface Order {
  id: string; code: string; customerName: string; customerPhone: string; addressText: string;
  status: string; subtotal: number; deliveryFee: number; grandTotal: number; note: string | null;
  deliveryDate: string | null; deliveryWindow: string | null;
  createdAt: string; items: OrderItem[];
}

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    try {
      const q = status ? `?status=${status}` : '';
      const r = await apiGet<{ data: Order[] }>(`/admin/orders${q}`);
      setOrders(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(filter); }, [filter, load]);

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await apiSend('PATCH', `/admin/orders/${id}/status`, { status });
      await load(filter);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Topbar title="Siparişler" sub="Bugünün operasyonu" />
      <div className="body">
        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Durum filtresi</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Tümü</option>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
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
                      <td><b>{o.code}</b></td>
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
                            <b>Adres:</b> {o.addressText}
                            {o.note && <> · <b>Not:</b> {o.note}</>}
                            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                              {o.items.map((it) => (
                                <li key={it.id}>
                                  {it.productName} — {it.orderedQty} {it.unitLabel ?? ''} → {tl(it.lineTotal)}
                                </li>
                              ))}
                            </ul>
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
      </div>
    </>
  );
}
