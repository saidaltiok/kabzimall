'use client';

import { useState } from 'react';
import { apiGet } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface DayPoint { date: string; units: number; orders: number; revenue: number }
interface Sales { productId: string; days: number; series: DayPoint[]; summary: { totalUnits: number; totalRevenue: number; activeDays: number; avgDailyUnits: number } }
interface Elasticity {
  available: boolean; reason?: string;
  changeAt?: string; oldPrice?: number; newPrice?: number; pricePct?: number;
  beforeAvgUnits?: number; afterAvgUnits?: number; unitsPct?: number; elasticity?: number | null;
}

const pctStr = (r?: number | null) => (r == null ? '—' : `${r > 0 ? '+' : ''}${(r * 100).toFixed(1)}%`);

export default function SatisPage() {
  const [productId, setProductId] = useState('domates');
  const [days, setDays] = useState('30');
  const [sales, setSales] = useState<Sales | null>(null);
  const [elast, setElast] = useState<Elasticity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true); setError(null);
    try {
      const [s, e] = await Promise.all([
        apiGet<Sales>(`/intel/analytics/sales?productId=${encodeURIComponent(productId.trim())}&days=${days}`),
        apiGet<Elasticity>(`/intel/analytics/elasticity?productId=${encodeURIComponent(productId.trim())}`),
      ]);
      setSales(s); setElast(e);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const maxUnits = sales?.series.reduce((m, p) => Math.max(m, p.units), 0) ?? 0;

  return (
    <>
      <Topbar title="Satış Analizi" sub="Günlük satış + fiyat esnekliği" />
      <div className="body">
        <p className="hint">
          Ürünün günlük satışını (birim/sipariş/ciro) ve son fiyat değişiminin talebe etkisini
          (<b>fiyat esnekliği</b>: "fiyat %-10 → satış %+18") gör. Sipariş verisinden hesaplanır.
        </p>
        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">Ürün</div>
          <div className="form-row">
            <div className="field"><label>Ürün slug</label><input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="domates" onKeyDown={(e) => e.key === 'Enter' && load()} /></div>
            <div className="field"><label>Gün</label>
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="7">Son 7 gün</option>
                <option value="30">Son 30 gün</option>
                <option value="90">Son 90 gün</option>
              </select>
            </div>
            <button className="btn" onClick={load} disabled={busy || !productId.trim()}>{busy ? '…' : 'Getir'}</button>
          </div>
        </div>

        {sales && (
          <>
            <div className="kpis">
              <div className="kpi"><div className="l">Toplam satış</div><div className="v">{sales.summary.totalUnits}</div><div className="d">son {sales.days} gün</div></div>
              <div className="kpi"><div className="l">Toplam ciro</div><div className="v">{tl(sales.summary.totalRevenue)}</div><div className="d">iptaller hariç</div></div>
              <div className="kpi"><div className="l">Ort. günlük satış</div><div className="v">{sales.summary.avgDailyUnits}</div><div className="d">{sales.summary.activeDays} aktif gün</div></div>
            </div>

            {elast && (
              <div className="aibox" style={{ margin: '14px 0' }}>
                <span className="k">Fiyat Esnekliği</span>
                {!elast.available ? (
                  <>Yeterli veri yok ({elast.reason}). Fiyat değişikliği + o dönemde satış oldukça hesaplanır.</>
                ) : (
                  <>
                    Son değişiklik: <b>{tl(elast.oldPrice ?? null)} → {tl(elast.newPrice ?? null)}</b> ({pctStr(elast.pricePct)}) ·{' '}
                    Ort. günlük satış <b>{elast.beforeAvgUnits} → {elast.afterAvgUnits}</b> ({pctStr(elast.unitsPct)}).{' '}
                    {elast.elasticity != null && (
                      <>Esneklik katsayısı <b>{elast.elasticity}</b> — {Math.abs(elast.elasticity) >= 1 ? 'talep fiyata duyarlı (esnek)' : 'talep fiyata görece duyarsız (inelastik)'}.</>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="card">
              <div className="ct">Günlük satış <span>{sales.series.length} gün</span></div>
              {sales.series.length === 0 ? (
                <p className="muted">Bu dönemde satış yok.</p>
              ) : (
                <table>
                  <thead><tr><th>Gün</th><th className="num">Birim</th><th className="num">Sipariş</th><th className="num">Ciro</th><th>Trend</th></tr></thead>
                  <tbody>
                    {sales.series.map((p) => (
                      <tr key={p.date}>
                        <td>{dt(p.date + 'T00:00:00').slice(0, 10) || p.date}</td>
                        <td className="num savecell">{p.units}</td>
                        <td className="num">{p.orders}</td>
                        <td className="num">{tl(p.revenue)}</td>
                        <td><div style={{ background: 'var(--forest)', height: 8, borderRadius: 4, width: `${maxUnits ? Math.round((p.units / maxUnits) * 100) : 0}%`, minWidth: 4 }} /></td>
                      </tr>
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
