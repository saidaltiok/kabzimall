'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { dt } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRODUCTS_TABS } from '@/components/SectionTabs';

interface Movement {
  id: string;
  product: { slug: string; name: string; unitLabel: string | null; stockQty: number | null };
  delta: number; reason: string; refCode: string | null; actor: string | null; createdAt: string;
}

const REASON_META: Record<string, { label: string; cls: string }> = {
  ORDER: { label: 'Sipariş', cls: 'info' },
  CANCEL: { label: 'İptal iadesi', cls: 'ok' },
  MANUAL: { label: 'Elle', cls: 'risk' },
};

export default function StokPage() {
  const [rows, setRows] = useState<Movement[]>([]);
  const [product, setProduct] = useState('');
  const [days, setDays] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true); setError(null);
    const q = new URLSearchParams({ days });
    if (product.trim()) q.set('product', product.trim());
    apiGet<{ data: Movement[] }>(`/catalog/products/stock-movements?${q}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [product, days]);
  useEffect(() => { load(); }, [load]);

  const fmtDelta = (m: Movement) => {
    const u = m.product.unitLabel === 'kg' ? ' kg' : m.product.unitLabel ? ` ${m.product.unitLabel}` : '';
    return `${m.delta > 0 ? '+' : ''}${m.delta}${u}`;
  };

  return (
    <>
      <Topbar title="Stok Hareketleri" sub="Stok takipli ürünlerde her değişimin izi" />
      <div className="body">
        <SectionTabs tabs={PRODUCTS_TABS} />
        <p className="hint">
          Sipariş düşümleri, iptal iadeleri ve katalogdan elle yapılan stok değişimleri burada iz bırakır.
          Stok alanı boş (takipsiz) ürünler hareket üretmez.
        </p>
        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="form-row">
            <div className="field"><label>Ürün slug (ops.)</label><input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="domates" onKeyDown={(e) => e.key === 'Enter' && load()} /></div>
            <div className="field"><label>Dönem</label>
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="7">Son 7 gün</option>
                <option value="30">Son 30 gün</option>
                <option value="90">Son 90 gün</option>
              </select>
            </div>
            <button className="btn" onClick={load} disabled={busy}>{busy ? '…' : 'Getir'}</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Hareketler <span>{rows.length} kayıt · en yeni üstte</span></div>
          {rows.length === 0 ? (
            <p className="muted">Bu dönemde hareket yok.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Zaman</th><th>Ürün</th><th className="num">Hareket</th><th>Neden</th><th>Referans</th><th className="num">Güncel stok</th></tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{dt(m.createdAt)}</td>
                    <td><b>{m.product.name}</b></td>
                    <td className="num" style={{ fontWeight: 700, color: m.delta < 0 ? 'var(--persimmon-d)' : 'var(--forest)' }}>{fmtDelta(m)}</td>
                    <td><span className={`tagp ${REASON_META[m.reason]?.cls ?? 'info'}`}>{REASON_META[m.reason]?.label ?? m.reason}</span></td>
                    <td className="muted" style={{ fontSize: 11.5 }}>{m.refCode ?? m.actor ?? '—'}</td>
                    <td className="num">{m.product.stockQty ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
