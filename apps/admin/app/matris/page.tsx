'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';

interface Row {
  slug: string; name: string; unitLabel: string | null; category: string | null;
  halAvg: number | null; byGroup: Record<string, number | null>;
  avg: number | null; premiumAvg: number | null; median: number | null; compCount: number;
  currentPrice: number | null; floorPrice: number | null; suggested: number | null;
  published: boolean; belowFloor: boolean;
}
interface Matrix { groups: string[]; rows: Row[]; date: string }

const k2 = (k: number | null) => (k == null ? '—' : (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function MatrisPage() {
  const [data, setData] = useState<Matrix | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await apiGet<Matrix>('/intel/pricing-matrix');
      setData(m);
      // yayın fiyatı girişi: güncel fiyat (yoksa öneri) ile önden doldur
      setPrices(Object.fromEntries(m.rows.map((r) => [r.slug, r.currentPrice != null ? k2(r.currentPrice) : r.suggested != null ? k2(r.suggested) : ''])));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      if (onlyActive && !r.published) return false;
      if (q && !r.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))) return false;
      return true;
    });
  }, [data, onlyActive, q]);

  const toggle = (slug: string) => setSel((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const allVisible = rows.length > 0 && rows.every((r) => sel.has(r.slug));
  const toggleAll = () => setSel(allVisible ? new Set() : new Set(rows.map((r) => r.slug)));

  function fillSuggested() {
    setPrices((p) => {
      const n = { ...p };
      for (const r of rows) if (sel.has(r.slug) && r.suggested != null) n[r.slug] = k2(r.suggested);
      return n;
    });
  }

  async function publish(allowBelowFloor = false) {
    const items = [...sel]
      .map((slug) => ({ slug, price: Math.round(parseFloat((prices[slug] ?? '').replace(',', '.')) * 100) }))
      .filter((it) => Number.isFinite(it.price) && it.price > 0);
    if (items.length === 0) { setError('Yayınlanacak geçerli fiyat yok.'); return; }
    setBusy(true); setError(null); setOk(null);
    try {
      const r = await apiSend<{ published: string[]; blocked: { slug: string; price: number; floor: number }[] }>('POST', '/intel/pricing-matrix/publish', { items, allowBelowFloor });
      if (r.published.length) setOk(`✓ ${r.published.length} ürün yayınlandı.`);
      if (r.blocked.length) {
        setError(`${r.blocked.length} ürün taban marjın ALTINDA (${r.blocked.map((b) => b.slug).join(', ')}). ` +
          `Yine de yayınlamak için "Tabana rağmen yayınla".`);
      } else {
        setSel(new Set());
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Fiyat Matrisi" sub="Hal + rakipler + öneri tek tabloda — toplu yayınla" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Her satır bir ürün; sütunlar <b>hal</b>, rakip grupları, <b>ortalama/premium/medyan</b>, <b>öneri</b> ve
          senin <b>yayın fiyatın</b>. Fiyatı yaz, satırları seç, <b>Seçilenleri yayınla</b>. Taban marjın altına
          yazılan fiyat engellenir (onayla geçilebilir). Premium ort. = medyan üstü rakiplerin ortalaması.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <div className="form-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 240 }}><label>Ara</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ürün adı…" /></div>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Yalnız yayında olanlar</label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>{sel.size} seçili</span>
              <button className="btn ghost" disabled={busy || sel.size === 0} onClick={fillSuggested}>Öneriyi doldur</button>
              <button className="btn" disabled={busy || sel.size === 0} onClick={() => publish(false)}>{busy ? '…' : 'Seçilenleri yayınla'}</button>
              {error?.includes('taban') && <button className="btn" style={{ background: 'var(--berry)' }} disabled={busy} onClick={() => publish(true)}>Tabana rağmen yayınla</button>}
            </div>
          </div>
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          {!data ? <p className="muted">Yükleniyor…</p> : (
            <table style={{ minWidth: 900, fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}><input type="checkbox" checked={allVisible} onChange={toggleAll} /></th>
                  <th>Ürün</th>
                  <th className="num">Hal</th>
                  {data.groups.map((g) => <th key={g} className="num" title={g}>{g.length > 10 ? g.slice(0, 9) + '…' : g}</th>)}
                  <th className="num">Ort.</th>
                  <th className="num">Premium</th>
                  <th className="num">Medyan</th>
                  <th className="num">Güncel</th>
                  <th className="num">Öneri</th>
                  <th className="num" style={{ minWidth: 110 }}>Yayın fiyatı (₺)</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const entered = Math.round(parseFloat((prices[r.slug] ?? '').replace(',', '.')) * 100);
                  const below = Number.isFinite(entered) && r.floorPrice != null && entered < r.floorPrice;
                  return (
                    <tr key={r.slug} style={sel.has(r.slug) ? { background: 'var(--cream)' } : undefined}>
                      <td><input type="checkbox" checked={sel.has(r.slug)} onChange={() => toggle(r.slug)} /></td>
                      <td><b>{r.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{r.category ?? '—'}{r.unitLabel ? ` · ${r.unitLabel}` : ''}</div></td>
                      <td className="num">{k2(r.halAvg)}</td>
                      {data.groups.map((g) => <td key={g} className="num" style={{ color: r.byGroup[g] == null ? 'var(--line)' : undefined }}>{k2(r.byGroup[g])}</td>)}
                      <td className="num">{k2(r.avg)}</td>
                      <td className="num">{k2(r.premiumAvg)}</td>
                      <td className="num">{k2(r.median)}</td>
                      <td className="num">{k2(r.currentPrice)}</td>
                      <td className="num">
                        {r.suggested != null ? (
                          <button className="btn ghost" style={{ padding: '2px 6px', fontSize: 11 }} title="Bu satıra öneriyi yaz" onClick={() => setPrices((p) => ({ ...p, [r.slug]: k2(r.suggested) }))}>{k2(r.suggested)}</button>
                        ) : '—'}
                      </td>
                      <td className="num">
                        <input
                          className="cell" style={{ width: 90, textAlign: 'right', borderColor: below ? 'var(--berry)' : undefined }}
                          value={prices[r.slug] ?? ''}
                          onChange={(e) => setPrices((p) => ({ ...p, [r.slug]: e.target.value }))}
                          title={r.floorPrice != null ? `Taban: ${k2(r.floorPrice)} ₺` : undefined}
                        />
                        {below && <div style={{ fontSize: 10, color: 'var(--berry)' }}>taban {k2(r.floorPrice)}</div>}
                      </td>
                      <td>{r.published ? <span className="tagp ok">yayında</span> : <span className="tagp info">kapalı</span>}{r.belowFloor && <span className="tagp zararina" title="Güncel fiyat taban altında" style={{ marginLeft: 4 }}>!</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
