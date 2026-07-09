'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { CUSTOMERS_TABS } from '@/components/SectionTabs';
import Modal from '@/components/Modal';
import OrderDetail, { type DetailOrder } from '@/components/OrderDetail';

interface Card {
  phone: string; name: string; email: string | null;
  orders: number; cancelled: number; totalSpent: number;
  firstOrderAt: string; lastOrderAt: string;
}
interface CustOrder {
  id: string; code: string; status: string; subtotal: number; discountTotal: number; couponCode: string | null;
  deliveryFee: number; grandTotal: number; finalTotal: number | null; createdAt: string;
  items: { productName: string; orderedQty: number }[];
}

const STATUS_TR: Record<string, string> = {
  RECEIVED: 'Alındı', PREPARING: 'Hazırlanıyor', READY: 'Paketlendi',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

export default function MusterilerPage() {
  const [rows, setRows] = useState<Card[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, CustOrder[]>>({});
  const [detail, setDetail] = useState<DetailOrder | null>(null); // tıklanan siparişin tam detayı
  const [detailBusy, setDetailBusy] = useState(false);

  /** Sipariş koduyla tam detayı çek (admin liste ucu kodla filtreler) → modal. */
  async function openDetail(code: string) {
    setDetailBusy(true);
    try {
      const r = await apiGet<{ data: DetailOrder[] }>(`/admin/orders?q=${encodeURIComponent(code)}`);
      const found = r.data.find((o) => o.code === code) ?? r.data[0] ?? null;
      if (found) setDetail(found);
      else setError('Sipariş detayı bulunamadı.');
    } catch (e) { setError((e as Error).message); } finally { setDetailBusy(false); }
  }

  const load = useCallback(() => {
    const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    apiGet<{ data: Card[] }>(`/admin/customers${q}`).then((r) => setRows(r.data)).catch((e) => setError((e as Error).message));
  }, [search]);
  useEffect(() => { load(); }, [load]);

  async function toggle(phone: string) {
    if (open === phone) { setOpen(null); return; }
    setOpen(phone);
    if (!orders[phone]) {
      try {
        const r = await apiGet<{ data: CustOrder[] }>(`/admin/customers/orders?phone=${encodeURIComponent(phone)}`);
        setOrders((cur) => ({ ...cur, [phone]: r.data }));
      } catch (e) { setError((e as Error).message); }
    }
  }

  return (
    <>
      <Topbar title="Müşteriler" sub="Sipariş geçmişinden türetilen müşteri kartları (guest-first, ayrı üyelik tablosu yok)" />
      <div className="body">
        <SectionTabs tabs={CUSTOMERS_TABS} />
        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="form-row">
            <div className="field" style={{ flex: 1, maxWidth: 340 }}>
              <label>Ara (ad / telefon / e-posta)</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ayşe ya da 0555…" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ct">Müşteriler <span>{rows.length} kişi</span></div>
          {rows.length === 0 ? (
            <p className="muted">Kayıt yok.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Müşteri</th><th>İletişim</th><th className="num">Sipariş</th><th className="num">Toplam harcama</th><th>Son sipariş</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <Fragment key={c.phone}>
                    <tr>
                      <td><b>{c.name}</b>{c.cancelled > 0 && <span className="tagp risk" style={{ marginLeft: 6 }}>{c.cancelled} iptal</span>}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{c.phone}{c.email && <div>{c.email}</div>}</td>
                      <td className="num"><b>{c.orders}</b></td>
                      <td className="num savecell">{tl(c.totalSpent)}</td>
                      <td className="muted" style={{ fontSize: 11.5 }}>{dt(c.lastOrderAt)}</td>
                      <td className="num">
                        <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggle(c.phone)}>
                          {open === c.phone ? 'Gizle' : 'Geçmiş'}
                        </button>
                      </td>
                    </tr>
                    {open === c.phone && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--cream)' }}>
                          {!orders[c.phone] ? (
                            <p className="muted" style={{ padding: 8 }}>Yükleniyor…</p>
                          ) : (
                            <table style={{ margin: '6px 0', background: '#fff', borderRadius: 10 }}>
                              <thead>
                                <tr><th>No</th><th>Zaman</th><th>İçerik</th><th className="num">Tutar</th><th>Durum</th></tr>
                              </thead>
                              <tbody>
                                {orders[c.phone].map((o) => (
                                  <tr key={o.id} onClick={() => openDetail(o.code)} style={{ cursor: 'pointer', ...(o.status === 'CANCELLED' ? { opacity: 0.55 } : {}) }} title="Sipariş detayını aç">
                                    <td><b>{o.code}</b>{o.couponCode && <span title={`Kupon ${o.couponCode}: −${tl(o.discountTotal)}`} style={{ marginLeft: 4 }}>🎟️</span>} <span className="muted" style={{ fontSize: 10.5 }}>detay ›</span></td>
                                    <td className="muted" style={{ fontSize: 11.5 }}>{dt(o.createdAt)}</td>
                                    <td className="muted" style={{ fontSize: 11.5 }}>{o.items.map((i) => i.productName).slice(0, 4).join(', ')}{o.items.length > 4 ? '…' : ''}</td>
                                    <td className="num">{tl(o.finalTotal ?? o.grandTotal)}</td>
                                    <td><span className="tagp info">{STATUS_TR[o.status] ?? o.status}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Sipariş ${detail.code}` : ''} sub={detail ? `${detail.items.length} kalem · ${tl(detail.finalTotal ?? detail.grandTotal)}` : undefined}>
          {detail && <OrderDetail order={detail} />}
        </Modal>
        {detailBusy && <div className="muted" style={{ position: 'fixed', bottom: 16, right: 16, background: '#fff', padding: '8px 14px', borderRadius: 10, boxShadow: 'var(--shadow-sm)', fontSize: 13 }}>Sipariş açılıyor…</div>}
      </div>
    </>
  );
}
