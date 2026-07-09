'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';
import { tlToKurus } from '@/lib/money';

interface Row {
  slug: string; name: string; unitLabel: string | null; category: string | null;
  halAvg: number | null; byGroup: Record<string, number | null>; byComp: Record<string, number | null>;
  avg: number | null; premiumAvg: number | null; median: number | null; compCount: number;
  currentPrice: number | null; floorPrice: number | null; suggested: number | null;
  published: boolean; belowFloor: boolean;
}
interface Competitor { id: string; name: string; group: string }
interface Matrix { groups: string[]; competitors: Competitor[]; rows: Row[]; date: string }

type Agg = 'avg' | 'median' | 'min' | 'max';
interface CustomCol { id: string; label: string; compIds: string[]; agg: Agg; offsetPct: number }

const AGG_LABEL: Record<Agg, string> = { avg: 'Ortalama', median: 'Medyan', min: 'En düşük', max: 'En yüksek' };
const k2 = (k: number | null) => (k == null ? '—' : (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const offLabel = (o: number) => (o ? ` ${o > 0 ? '+' : ''}%${o}` : '');

/** Bir satırın seçili rakiplerindeki fiyatlardan istenen kırılımı + ± offset ile hesapla (client-side). */
function aggregate(row: Row, compIds: string[], agg: Agg, offsetPct = 0): number | null {
  const vals = compIds.map((id) => row.byComp[id]).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  let base: number;
  if (agg === 'min') base = Math.min(...vals);
  else if (agg === 'max') base = Math.max(...vals);
  else if (agg === 'avg') base = vals.reduce((s, v) => s + v, 0) / vals.length;
  else { const s = [...vals].sort((a, b) => a - b); const m = Math.floor(s.length / 2); base = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  return Math.round(base * (1 + offsetPct / 100));
}

// Basit deterministik id (Math.random yok — sütun sırasına göre).
let colSeq = 0;
const nextColId = () => `c${++colSeq}`;

export default function MatrisPage() {
  const [data, setData] = useState<Matrix | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [q, setQ] = useState('');
  const [showGroups, setShowGroups] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  // Dinamik sütunlar (localStorage'da saklanır)
  const [customCols, setCustomCols] = useState<CustomCol[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [bLabel, setBLabel] = useState('');
  const [bAgg, setBAgg] = useState<Agg>('avg');
  const [bOffset, setBOffset] = useState('');
  const [bComps, setBComps] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { const s = localStorage.getItem('matris:customCols'); if (s) setCustomCols(JSON.parse(s)); } catch { /* yok */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('matris:customCols', JSON.stringify(customCols)); } catch { /* yok */ }
  }, [customCols]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await apiGet<Matrix>('/intel/pricing-matrix');
      setData(m);
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

  function addCustomCol() {
    if (bComps.size === 0) { setError('Sütun için en az bir rakip seç.'); return; }
    const ids = [...bComps];
    const off = bOffset.trim() === '' ? 0 : parseFloat(bOffset.replace(',', '.'));
    const offsetPct = Number.isFinite(off) ? off : 0;
    const names = data?.competitors.filter((c) => bComps.has(c.id)).map((c) => c.name) ?? [];
    const label = bLabel.trim() || `${names.join('+')} ${AGG_LABEL[bAgg].toLowerCase()}${offLabel(offsetPct)}`;
    setCustomCols((cs) => [...cs, { id: nextColId(), label, compIds: ids, agg: bAgg, offsetPct }]);
    setBLabel(''); setBOffset(''); setBComps(new Set()); setBuilderOpen(false); setError(null);
  }
  const removeCustomCol = (id: string) => setCustomCols((cs) => cs.filter((c) => c.id !== id));
  const toggleBComp = (id: string) => setBComps((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /** Bir özel sütunun hesapladığı fiyatı yayın kutularına yaz (taban korumalı). Seçili satır varsa onlara, yoksa filtrelenen tümüne. */
  function applyColumnToPublish(col: CustomCol) {
    const targets = rows.filter((r) => (sel.size ? sel.has(r.slug) : true));
    let written = 0;
    setPrices((p) => {
      const n = { ...p };
      for (const r of targets) {
        const v = aggregate(r, col.compIds, col.agg, col.offsetPct);
        if (v == null) continue;
        const floored = r.floorPrice != null ? Math.max(v, r.floorPrice) : v;
        n[r.slug] = k2(floored); written++;
      }
      return n;
    });
    setOk(`✓ "${col.label}" ${written} ürünün yayın kutusuna yazıldı (taban korumalı). Kontrol edip “Seçilenleri yayınla” ile onayla.`);
  }

  async function publish(allowBelowFloor = false) {
    const items = [...sel]
      .map((slug) => ({ slug, price: (tlToKurus(prices[slug]) ?? 0) }))
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

  // Rakipleri gruba göre kümele (kurucu paneli için)
  const compsByGroup = useMemo(() => {
    const m = new Map<string, Competitor[]>();
    for (const c of data?.competitors ?? []) { const a = m.get(c.group) ?? []; a.push(c); m.set(c.group, a); }
    return [...m.entries()];
  }, [data]);

  return (
    <>
      <Topbar title="Fiyat Matrisi" sub="Hal + rakipler + öneri tek tabloda — toplu yayınla" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Her satır bir ürün; sütunlar <b>hal</b>, rakip grupları, <b>ortalama/premium/medyan</b>, <b>öneri</b> ve
          senin <b>yayın fiyatın</b>. Fiyatı yaz, satırları seç, <b>Seçilenleri yayınla</b>. Taban marjın altına
          yazılan fiyat engellenir (onayla geçilebilir).{' '}
          <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--forest)', fontWeight: 700, fontSize: 'inherit' }} onClick={() => setShowLegend((s) => !s)}>
            Sütunlar ne anlama geliyor? {showLegend ? '▲' : '▼'}
          </button>
        </p>

        {showLegend && (
          <div className="card" style={{ background: 'var(--cream, #f6f3ec)' }}>
            <div className="ct">Sütun açıklamaları</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              <li><b>Hal</b>: Ürünün hal (toptancı) piyasa fiyatının o günkü ortalaması — senin alış tarafın.</li>
              <li><b>Rakip grupları</b> (A101, BİM, migros vb.): O gruptaki rakiplerin o ürün için ortalama rafiyatı.</li>
              <li><b>Ort.</b>: Tüm rakiplerin fiyat ortalaması (grup ayırmadan).</li>
              <li><b>Premium</b>: <u>Medyanın üstündeki</u> rakiplerin ortalaması — yani üst segment/pahalı satanların seviyesi. "Ben de biraz pahalı konumlanırsam tavanım ne olur?" sorusunun cevabı.</li>
              <li><b>Medyan</b>: Rakip fiyatlarını küçükten büyüğe dizince tam ortadaki değer. Uç fiyatlardan (çok ucuz/çok pahalı) etkilenmez, "tipik piyasa" fiyatıdır.</li>
              <li><b>Güncel</b>: Senin şu an yayında olan satış fiyatın (indirimli varsa o).</li>
              <li><b>Öneri</b>: Motorun taban marjı koruyarak hesapladığı önerilen fiyat — tıklayınca yayın kutusuna yazılır.</li>
              <li><b>Yayın fiyatı</b>: Yayınlamak istediğin fiyat. Taban altındaysa kırmızı uyarır.</li>
              <li><b>Özel sütunlar</b>: Aşağıdan seçtiğin rakiplerin (ör. A101+BİM+ŞOK) ortalama/medyan/en düşük/en yüksek kırılımı; istersen <b>±% ayarlama</b> ekle (ör. ort. −%5). Sütun çipindeki <b>→ yayına yaz</b> ile bu stratejiyi seçili/tüm ürünlerin yayın fiyatına taban-korumalı yazabilirsin.</li>
            </ul>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        {/* Dinamik sütun kurucu */}
        <div className="card">
          <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Özel rakip sütunları
            <span>seçtiğin rakiplerden kendi kıyas sütununu oluştur</span>
            <button className="btn ghost" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setBuilderOpen((o) => !o)}>
              {builderOpen ? 'Kapat' : '+ Sütun ekle'}
            </button>
          </div>

          {customCols.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: builderOpen ? 12 : 0 }}>
              {customCols.map((c) => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--forest)', color: 'var(--forest)', borderRadius: 20, padding: '4px 6px 4px 12px', fontSize: 12.5, fontWeight: 600 }}>
                  {c.label} <span className="muted" style={{ fontWeight: 400 }}>({c.compIds.length} rakip · {AGG_LABEL[c.agg]}{offLabel(c.offsetPct)})</span>
                  <button onClick={() => applyColumnToPublish(c)} title={`Bu stratejiyi ${sel.size ? 'seçili' : 'filtrelenen tüm'} ürünlerin yayın fiyatına yaz (taban korumalı)`} style={{ border: 'none', background: 'var(--forest)', color: '#fff', borderRadius: 12, padding: '2px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>→ yayına yaz</button>
                  <button onClick={() => removeCustomCol(c.id)} title="Sütunu kaldır" style={{ border: 'none', background: 'var(--cream, #f0ede6)', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}

          {builderOpen && (
            <div style={{ borderTop: customCols.length ? '1px solid var(--line)' : 'none', paddingTop: 12 }}>
              {!data ? <p className="muted">Rakipler yükleniyor…</p> : data.competitors.length === 0 ? (
                <p className="muted">Kayıtlı rakip yok. Önce Rakipler ekranından rakip ekle.</p>
              ) : (
                <>
                  <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div className="field" style={{ minWidth: 200 }}><label>Sütun adı (boş bırakırsan otomatik)</label>
                      <input value={bLabel} onChange={(e) => setBLabel(e.target.value)} placeholder="ör. İndirim marketleri ort." />
                    </div>
                    <div className="field"><label>Kırılım</label>
                      <select value={bAgg} onChange={(e) => setBAgg(e.target.value as Agg)}>
                        <option value="avg">Ortalama</option>
                        <option value="median">Medyan</option>
                        <option value="min">En düşük</option>
                        <option value="max">En yüksek</option>
                      </select>
                    </div>
                    <div className="field"><label>Ayarlama (%) <span className="muted" style={{ fontWeight: 400 }}>eksi = ucuz</span></label>
                      <input value={bOffset} onChange={(e) => setBOffset(e.target.value)} placeholder="-5 / +9" style={{ width: 90 }} title="Seçili tabana uygulanır: -5 → %5 altı, +9 → %9 üstü" />
                    </div>
                    <button className="btn" onClick={addCustomCol} disabled={bComps.size === 0}>Sütunu ekle ({bComps.size})</button>
                  </div>
                  <div style={{ fontSize: 12.5 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Bu sütuna girecek rakipleri seç:</div>
                    {compsByGroup.map(([grp, cs]) => (
                      <div key={grp} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', color: 'var(--muted, #888)', marginBottom: 4 }}>{grp}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {cs.map((c) => (
                            <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${bComps.has(c.id) ? 'var(--forest)' : 'var(--line)'}`, background: bComps.has(c.id) ? 'var(--cream, #f6f3ec)' : '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={bComps.has(c.id)} onChange={() => toggleBComp(c.id)} style={{ margin: 0 }} />
                              {c.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <div className="form-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 240 }}><label>Ara</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ürün adı…" /></div>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Yalnız yayında olanlar</label>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showGroups} onChange={(e) => setShowGroups(e.target.checked)} /> Rakip gruplarını göster</label>
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
                  {showGroups && data.groups.map((g) => <th key={g} className="num" title={g}>{g.length > 10 ? g.slice(0, 9) + '…' : g}</th>)}
                  <th className="num">Ort.</th>
                  <th className="num" title="Medyan üstü rakiplerin ortalaması — üst segment">Premium</th>
                  <th className="num">Medyan</th>
                  {customCols.map((c) => (
                    <th key={c.id} className="num" title={`${AGG_LABEL[c.agg]} · ${c.compIds.length} rakip`} style={{ color: 'var(--forest)' }}>
                      {c.label.length > 14 ? c.label.slice(0, 13) + '…' : c.label}
                    </th>
                  ))}
                  <th className="num">Güncel</th>
                  <th className="num">Öneri</th>
                  <th className="num" style={{ minWidth: 110 }}>Yayın fiyatı (₺)</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const entered = tlToKurus(prices[r.slug]) ?? NaN;
                  const below = Number.isFinite(entered) && r.floorPrice != null && entered < r.floorPrice;
                  return (
                    <tr key={r.slug} style={sel.has(r.slug) ? { background: 'var(--cream)' } : undefined}>
                      <td><input type="checkbox" checked={sel.has(r.slug)} onChange={() => toggle(r.slug)} /></td>
                      <td><b>{r.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{r.category ?? '—'}{r.unitLabel ? ` · ${r.unitLabel}` : ''}</div></td>
                      <td className="num">{k2(r.halAvg)}</td>
                      {showGroups && data.groups.map((g) => <td key={g} className="num" style={{ color: r.byGroup[g] == null ? 'var(--line)' : undefined }}>{k2(r.byGroup[g])}</td>)}
                      <td className="num">{k2(r.avg)}</td>
                      <td className="num">{k2(r.premiumAvg)}</td>
                      <td className="num">{k2(r.median)}</td>
                      {customCols.map((c) => <td key={c.id} className="num" style={{ background: 'rgba(45,106,79,.05)' }}>{k2(aggregate(r, c.compIds, c.agg, c.offsetPct))}</td>)}
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
