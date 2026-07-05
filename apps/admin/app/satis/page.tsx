'use client';

import { useEffect, useState } from 'react';
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
interface Overview {
  days: number;
  series: { date: string; orders: number; revenue: number; discount: number }[];
  summary: { totalOrders: number; totalRevenue: number; totalDiscount: number; avgOrderValue: number };
}
interface Mover {
  slug: string; name: string; changes: number; avgAbsPct: number; netPct: number;
  firstPrice: number; lastPrice: number; byDay: Record<string, number>;
}
interface Movers {
  days: number; dayKeys: string[]; movers: Mover[];
  summary: { changedProducts: number; unchangedProducts: number; totalChanges: number };
}
interface Affinity {
  days: number; ordersAnalyzed: number;
  topProducts: { slug: string; name: string; orders: number }[];
  pairs: { a: { slug: string; name: string }; b: { slug: string; name: string }; together: number; confidence: number }[];
  suggestedBasket: { slug: string; name: string }[];
}

const pctStr = (r?: number | null) => (r == null ? '—' : `${r > 0 ? '+' : ''}${(r * 100).toFixed(1)}%`);

/** YYYY-AA-GG → "YYYY-Wnn" ISO haftası (uzun dönem ısı haritası kırılımı). */
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // haftanın perşembesi hangi yıla düşerse
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default function SatisPage() {
  const [productId, setProductId] = useState('domates');
  const [days, setDays] = useState('30');
  const [sales, setSales] = useState<Sales | null>(null);
  const [elast, setElast] = useState<Elasticity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ovDays, setOvDays] = useState('7');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [mvDays, setMvDays] = useState('30');
  const [movers, setMovers] = useState<Movers | null>(null);
  const [affinity, setAffinity] = useState<Affinity | null>(null);

  useEffect(() => {
    apiGet<Overview>(`/intel/analytics/overview?days=${ovDays}`).then(setOverview).catch(() => {});
  }, [ovDays]);
  useEffect(() => {
    apiGet<Movers>(`/intel/analytics/price-movers?days=${mvDays}`).then(setMovers).catch(() => {});
  }, [mvDays]);
  useEffect(() => {
    apiGet<Affinity>('/intel/analytics/basket-affinity?days=90').then(setAffinity).catch(() => {});
  }, []);

  // 45 günden uzun dönemde ısı haritası haftalık kırılıma iner (hücre = ISO haftası).
  const weekly = movers != null && movers.days > 45;
  const heatCols: { key: string; label: string }[] = movers
    ? weekly
      ? [...new Set(movers.dayKeys.map(isoWeek))].map((w) => ({ key: w, label: w.slice(5) }))
      : movers.dayKeys.map((d) => ({ key: d, label: d }))
    : [];
  const cellCount = (m: Mover, key: string) =>
    weekly
      ? Object.entries(m.byDay).reduce((s, [day, n]) => (isoWeek(day) === key ? s + n : s), 0)
      : m.byDay[key] ?? 0;

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

        {/* Mağaza geneli — günlük ciro/sipariş */}
        {overview && (
          <div className="card">
            <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Mağaza geneli
              <span>{tl(overview.summary.totalRevenue)} ciro · {overview.summary.totalOrders} sipariş · ort. sepet {tl(overview.summary.avgOrderValue)}{overview.summary.totalDiscount > 0 && <> · 🎟️ {tl(overview.summary.totalDiscount)} indirim</>}</span>
              <select value={ovDays} onChange={(e) => setOvDays(e.target.value)} style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 8px' }}>
                <option value="7">Son 7 gün</option>
                <option value="30">Son 30 gün</option>
                <option value="90">Son 90 gün</option>
              </select>
            </div>
            {overview.summary.totalOrders === 0 ? (
              <p className="muted">Bu dönemde sipariş yok.</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: overview.series.length > 31 ? 2 : 6, height: 96, padding: '4px 2px 0' }}>
                {overview.series.map((p) => {
                  const max = overview.series.reduce((m, q) => Math.max(m, q.revenue), 0);
                  const h = max ? Math.max(3, Math.round((p.revenue / max) * 78)) : 3;
                  return (
                    <div key={p.date} title={`${p.date} · ${tl(p.revenue)} · ${p.orders} sipariş`} style={{ flex: 1, height: h, borderRadius: 3, background: p.revenue > 0 ? 'var(--forest)' : 'var(--line)' }} />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Fiyat hareketliliği — volatilite + ısı haritası (45+ günde haftalık kırılım) */}
        {movers && movers.summary.totalChanges > 0 && (
          <div className="card">
            <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Fiyat hareketliliği
              <span>son {movers.days} gün · {movers.summary.totalChanges} değişiklik · {movers.summary.changedProducts} ürün oynadı, {movers.summary.unchangedProducts} sabit</span>
              <select value={mvDays} onChange={(e) => setMvDays(e.target.value)} style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 8px' }}>
                <option value="7">Son 7 gün</option>
                <option value="30">Son 30 gün</option>
                <option value="90">Son 90 gün (haftalık)</option>
              </select>
            </div>
            <table>
              <thead>
                <tr><th>Ürün</th><th className="num">Değişim</th><th className="num">Ort. |%|</th><th className="num">Net %</th><th className="num">İlk → Son</th><th>Yoğunluk (gün gün)</th></tr>
              </thead>
              <tbody>
                {movers.movers.slice(0, 12).map((m) => (
                  <tr key={m.slug}>
                    <td><b>{m.name}</b></td>
                    <td className="num">{m.changes}</td>
                    <td className="num">{(m.avgAbsPct * 100).toFixed(1)}%</td>
                    <td className="num" style={{ color: m.netPct > 0 ? 'var(--persimmon-d)' : m.netPct < 0 ? 'var(--forest)' : undefined }}>{pctStr(m.netPct)}</td>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>{tl(m.firstPrice)} → {tl(m.lastPrice)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 1.5 }}>
                        {heatCols.map((col) => {
                          const n = cellCount(m, col.key);
                          return <div key={col.key} title={`${weekly ? col.key + ' haftası' : col.key}: ${n} değişiklik`} style={{ width: weekly ? 14 : 7, height: 16, borderRadius: 2, background: n === 0 ? 'var(--cream-d, #eee)' : n === 1 ? '#e8b04b' : 'var(--persimmon)' }} />;
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Isı haritası ({weekly ? 'hücre = hafta' : 'hücre = gün'}): gri = değişiklik yok · sarı = 1 · turuncu = 2+. En çok oynayan 12 ürün gösterilir.
            </p>
          </div>
        )}

        {/* İdeal sepet önerisi — birlikte-satın-alma analizi */}
        {affinity && affinity.pairs.length > 0 && (
          <div className="card">
            <div className="ct">🧺 İdeal sepet önerisi <span>son {affinity.days} gün · {affinity.ordersAnalyzed} sipariş analiz edildi</span></div>
            {affinity.suggestedBasket.length >= 2 && (
              <div className="aibox" style={{ marginBottom: 12 }}>
                <span className="k">Önerilen bileşim</span>
                {affinity.suggestedBasket.map((s) => s.name).join(' + ')} — bu ürünler sık birlikte alınıyor.
                Hazır sepet olarak satmak için: <a href="/sepetler" style={{ color: 'var(--forest)', fontWeight: 700 }}>Hazır sepetler →</a>
              </div>
            )}
            <table>
              <thead>
                <tr><th>Birlikte alınan çift</th><th className="num">Kaç siparişte</th><th className="num">Birliktelik</th></tr>
              </thead>
              <tbody>
                {affinity.pairs.map((p) => (
                  <tr key={`${p.a.slug}|${p.b.slug}`}>
                    <td><b>{p.a.name}</b> + <b>{p.b.name}</b></td>
                    <td className="num">{p.together}</td>
                    <td className="num">
                      %{Math.round(p.confidence * 100)}
                      <div style={{ background: 'var(--line)', borderRadius: 3, height: 5, width: 90, display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }}>
                        <div style={{ background: 'var(--forest)', height: 5, borderRadius: 3, width: `${Math.min(100, Math.round(p.confidence * 100))}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Birliktelik: çifti birlikte içeren siparişlerin, çiftin daha az satan ürününün geçtiği siparişlere oranı.
              Hazır sepetler analiz dışıdır (kendileri zaten paket).
            </p>
          </div>
        )}

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
