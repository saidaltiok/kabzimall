'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';
import DataTable, { type Column } from '@/components/DataTable';

interface Row {
  slug: string; name: string; unitLabel: string | null; category: string | null;
  myBuy: number | null; halAvg: number | null; compAvg: number | null; sell: number | null;
  buyVsHalPct: number | null; compVsHalPct: number | null; sellVsBuyPct: number | null; sellVsCompPct: number | null;
}
interface SeriesPoint { date: string; myBuy: number | null; hal: number | null; comp: number | null }
interface Series { slug: string; name: string; unitLabel: string | null; days: number; series: SeriesPoint[] }

function Pct({ v, goodHigh, suffix }: { v: number | null; goodHigh?: boolean; suffix?: string }) {
  if (v == null) return <span className="muted">—</span>;
  const positive = v >= 0;
  const good = goodHigh ? positive : !positive;
  return (
    <span style={{ color: good ? 'var(--forest)' : 'var(--berry, #b3261e)', fontWeight: 600, fontSize: 12.5 }}>
      {positive ? '+' : ''}{v.toLocaleString('tr-TR')}%{suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export default function KokpitPage() {
  const [days, setDays] = useState('30');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Series | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null); setFocus(null);
    apiGet<{ rows: Row[] }>(`/intel/pricing-cockpit?days=${days}`).then((r) => setRows(r.rows)).catch((e) => setError((e as Error).message));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  async function openTrend(r: Row) {
    setFocusBusy(true);
    try { setFocus(await apiGet<Series>(`/intel/pricing-cockpit/${encodeURIComponent(r.slug)}?days=${days}`)); }
    catch { /* sessiz */ } finally { setFocusBusy(false); }
  }

  const columns: Column<Row>[] = [
    { key: 'name', label: 'Ürün', locked: true, sortValue: (r) => r.name, render: (r) => <><b>{r.name}</b> <span className="muted" style={{ fontSize: 10.5 }}>/{r.unitLabel ?? 'birim'}</span></> },
    { key: 'category', label: 'Kategori', defaultHidden: true, sortValue: (r) => r.category, render: (r) => <span className="muted">{r.category ?? '—'}</span> },
    { key: 'myBuy', label: 'Benim alışım', align: 'right', sortValue: (r) => r.myBuy, render: (r) => <span className="savecell">{tl(r.myBuy)}</span> },
    { key: 'halAvg', label: 'Hal', align: 'right', sortValue: (r) => r.halAvg, render: (r) => tl(r.halAvg) },
    { key: 'buyVsHalPct', label: 'Alışım↔Hal', align: 'right', sortValue: (r) => r.buyVsHalPct, render: (r) => <Pct v={r.buyVsHalPct} goodHigh={false} /> },
    { key: 'compAvg', label: 'Rakip', align: 'right', sortValue: (r) => r.compAvg, render: (r) => tl(r.compAvg) },
    { key: 'compVsHalPct', label: 'Rakip kârı', align: 'right', sortValue: (r) => r.compVsHalPct, render: (r) => <Pct v={r.compVsHalPct} goodHigh /> },
    { key: 'sell', label: 'Satışım', align: 'right', sortValue: (r) => r.sell, render: (r) => tl(r.sell) },
    { key: 'sellVsBuyPct', label: 'Kârım', align: 'right', sortValue: (r) => r.sellVsBuyPct, render: (r) => <Pct v={r.sellVsBuyPct} goodHigh /> },
    { key: 'sellVsCompPct', label: 'Rakibe göre', align: 'right', sortValue: (r) => r.sellVsCompPct, render: (r) => <Pct v={r.sellVsCompPct} goodHigh={false} suffix={r.sellVsCompPct != null && r.sellVsCompPct > 0 ? 'pahalı' : 'ucuz'} /> },
  ];

  return (
    <>
      <Topbar title="Fiyat Kokpiti" sub="Fiyatlamanın esası: benim hal alış fiyatım. Hal ve rakip fiyatları fikir verir." />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Her ürün için <b>benim alış fiyatım</b> (hal alımlarından), <b>hal piyasa</b> ort., <b>rakip</b> ort. ve
          <b> benim satış fiyatım</b> yan yana. Başlığa tıklayıp sıralayın; <b>⚙ Sütunlar</b> ile gizleyip/sabitleyin.
          Satıra tıklayınca <b>zaman trendi</b> altta açılır.
        </p>
        <div className="form-row" style={{ marginBottom: 12, alignItems: 'center' }}>
          <div className="field"><label>Dönem</label>
            <select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">Son 7 gün</option>
              <option value="30">Son 30 gün</option>
              <option value="90">Son 90 gün</option>
            </select>
          </div>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">Alış · Hal · Rakip · Satış {rows && <span>{rows.length} ürün</span>}</div>
          {rows == null ? (
            <p className="muted">Yükleniyor…</p>
          ) : (
            <DataTable id="kokpit" columns={columns} rows={rows} rowKey={(r) => r.slug} onRowClick={openTrend} emptyText="Bu dönemde hal alımı / hal fiyatı / rakip verisi olan ürün yok." />
          )}
          <p className="note2" style={{ marginTop: 8 }}>
            <b>Alışım↔Hal</b> eksi (−) ise halden ucuza alıyorsun (iyi). <b>Rakip kârı</b>: rakibin hal&apos;e göre marjı.
            <b> Kârım</b>: satışın alışına göre kârı. <b>Rakibe göre</b>: satışın rakip ort. üstünde mi (pahalı) altında mı (ucuz).
          </p>
        </div>

        {focusBusy && <p className="muted">Trend açılıyor…</p>}
        {focus && (
          <div className="card">
            <div className="ct">{focus.name} — zaman trendi <span>son {focus.days} gün</span></div>
            {focus.series.length === 0 ? (
              <p className="muted">Bu dönemde günlük veri yok.</p>
            ) : (
              <table>
                <thead><tr><th>Gün</th><th className="num">Benim alışım</th><th className="num">Hal</th><th className="num">Rakip</th><th className="num">Alışım↔Hal</th></tr></thead>
                <tbody>
                  {focus.series.map((p) => {
                    const diff = p.myBuy != null && p.hal != null && p.hal !== 0 ? Math.round(((p.myBuy - p.hal) / p.hal) * 1000) / 10 : null;
                    return (
                      <tr key={p.date}>
                        <td className="muted" style={{ fontSize: 12 }}>{p.date}</td>
                        <td className="num savecell">{tl(p.myBuy)}</td>
                        <td className="num">{tl(p.hal)}</td>
                        <td className="num">{tl(p.comp)}</td>
                        <td className="num"><Pct v={diff} goodHigh={false} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
