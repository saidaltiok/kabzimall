'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { COST_TABS } from '@/components/SectionTabs';
import { tlToKurus } from '@/lib/money';

interface Row {
  slug: string; name: string; unitLabel: string | null; category: string | null;
  source: 'PRODUCT' | 'GLOBAL' | null; halAvg: number | null; directCost: number | null;
  components: { fireRate: number; labor: number; packaging: number; fuel: number; coldStorage: number; amortization: number } | null;
}
/** Satır düzenleme durumu (TL/% string olarak). */
interface EditRow { fire: string; labor: string; pack: string; fuel: string; cold: string; amort: string }

const k2 = (k: number) => (k / 100).toFixed(2);
const FIELDS: { key: keyof EditRow; label: string; pct?: boolean }[] = [
  { key: 'fire', label: 'Fire %', pct: true },
  { key: 'labor', label: 'İşçilik ₺' },
  { key: 'pack', label: 'Ambalaj ₺' },
  { key: 'fuel', label: 'Yakıt ₺' },
  { key: 'cold', label: 'Soğuk zincir ₺' },
  { key: 'amort', label: 'Amortisman ₺' },
];

/** Bir satırın kayıtlı bileşenlerini düzenleme string'lerine çevir. */
const editOf = (c: Row['components']): EditRow => c ? {
  fire: String(Math.round(c.fireRate * 100)), labor: k2(c.labor), pack: k2(c.packaging),
  fuel: k2(c.fuel), cold: k2(c.coldStorage), amort: k2(c.amortization),
} : { fire: '', labor: '', pack: '', fuel: '', cold: '', amort: '' };

export default function MaliyetTabloPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  // Toplu doldur (matris tarzı): bir kalemi filtrelenen tüm satırlara yaz.
  const [bulkField, setBulkField] = useState<keyof EditRow>('fire');
  const [bulkValue, setBulkValue] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiGet<{ data: Row[] }>('/intel/cost-components/table');
      setRows(r.data);
      setEdits(Object.fromEntries(r.data.map((row) => [row.slug, editOf(row.components)])));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')), [rows]);

  const filtered = useMemo(
    () => rows.filter((r) => (!q || r.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))) && (!cat || r.category === cat)),
    [rows, q, cat],
  );

  /** Girdisi orijinalden farklı satırlar (yalnız onlar kaydedilir). */
  const changed = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const e = edits[r.slug];
      if (!e || !r.components) continue;
      const o = editOf(r.components);
      if (FIELDS.some((f) => e[f.key] !== o[f.key])) out.push(r.slug);
    }
    return out;
  }, [rows, edits]);

  const set = (slug: string, key: keyof EditRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEdits((s) => ({ ...s, [slug]: { ...s[slug], [key]: e.target.value } }));

  /** Seçili kalemi filtrelenen tüm (girdisi olan) satırlara yaz — kaydetmeden önce. */
  function bulkFill() {
    if (bulkValue.trim() === '') return;
    setEdits((s) => {
      const n = { ...s };
      for (const r of filtered) if (r.components) n[r.slug] = { ...n[r.slug], [bulkField]: bulkValue };
      return n;
    });
  }

  async function saveChanged() {
    setBusy(true); setError(null); setOk(null);
    const tl2k = (v: string) => tlToKurus(v) ?? 0;
    let saved = 0;
    try {
      for (const slug of changed) {
        const e = edits[slug];
        await apiSend('PUT', '/intel/cost-components', {
          scope: 'PRODUCT', refId: slug,
          fireRate: parseFloat(e.fire.replace(',', '.')) / 100,
          labor: tl2k(e.labor), packaging: tl2k(e.pack), fuel: tl2k(e.fuel),
          coldStorage: tl2k(e.cold), amortization: tl2k(e.amort),
          commissionRate: 0, // komisyon genel giderde (Finans) — birim maliyete girmez
        });
        saved++;
      }
      setOk(`✓ ${saved} ürünün maliyet girdisi kaydedildi (ürün-özel).`);
      await load();
    } catch (e) {
      setError(`${saved} kaydedildi, sonra hata: ${(e as Error).message}`);
      await load();
    } finally { setBusy(false); }
  }

  function resetEdits() { setEdits(Object.fromEntries(rows.map((r) => [r.slug, editOf(r.components)]))); }

  return (
    <>
      <Topbar title="Maliyet Tablosu" sub="Tüm ürünlerin girdileri tek matriste — değiştir, toplu doldur, toplu kaydet" />
      <div className="body">
        <SectionTabs tabs={COST_TABS} />
        <p className="hint">
          Fiyat matrisi gibi: her satır bir ürün, sütunlar maliyet girdileri (fire, işçilik, ambalaj, yakıt,
          soğuk zincir, amortisman). Hücreyi değiştir → <b>Değişenleri kaydet</b>. Kaydedilen satır ürün-özel
          olur; dokunulmayan GLOBAL varsayılanı kullanır. <b>Toplu doldur</b> ile bir kalemi filtrelenen tüm
          ürünlere tek seferde yazabilirsin. Kart komisyonu burada değil — <b>Finans → Genel Giderler</b>&apos;de.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 220 }}><label>Ara</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ürün adı…" /></div>
            <div className="field"><label>Kategori</label>
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Tüm kategoriler</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>{changed.length} satır değişti</span>
              {changed.length > 0 && <button className="btn ghost" disabled={busy} onClick={resetEdits} style={{ fontSize: 12 }}>Geri al</button>}
              <button className="btn" disabled={busy || changed.length === 0} onClick={saveChanged}>{busy ? '…' : 'Değişenleri kaydet'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Toplu doldur:</span>
            <div className="field"><label>Kalem</label>
              <select value={bulkField} onChange={(e) => setBulkField(e.target.value as keyof EditRow)}>
                {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Değer</label><input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={FIELDS.find((f) => f.key === bulkField)?.pct ? 'ör. 15' : 'ör. 1,20'} style={{ width: 100 }} /></div>
            <button className="btn ghost" onClick={bulkFill} disabled={bulkValue.trim() === ''}>Filtrelenen {filtered.length} satıra yaz</button>
            <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>(yazar, kaydetmez — sonra “Değişenleri kaydet”)</span>
          </div>
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          {rows.length === 0 ? <p className="muted">Yükleniyor…</p> : (
            <table style={{ minWidth: 860, fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Ürün</th><th className="num">Hal</th>
                  {FIELDS.map((f) => <th key={f.key} className="num">{f.label}</th>)}
                  <th className="num">Birim maliyet</th><th>Kaynak</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const e = edits[r.slug];
                  const dirty = changed.includes(r.slug);
                  return (
                    <tr key={r.slug} style={dirty ? { background: 'var(--cream)' } : undefined}>
                      <td><b>{r.name}</b><div className="muted" style={{ fontSize: 10.5 }}>{r.category ?? '—'}{r.unitLabel ? ` · ${r.unitLabel}` : ''}</div></td>
                      <td className="num">{r.halAvg != null ? tl(r.halAvg) : <span className="muted">—</span>}</td>
                      {FIELDS.map((f) => (
                        <td className="num" key={f.key}>
                          <input className="cell" style={{ width: 58, textAlign: 'right' }} value={e?.[f.key] ?? ''} onChange={set(r.slug, f.key)} disabled={!r.components} />
                        </td>
                      ))}
                      <td className="num">{r.directCost != null ? <b>{tl(r.directCost)}</b> : <span className="muted" title="Hal verisi yok">—</span>}</td>
                      <td>{r.source === 'PRODUCT' ? <span className="tagp ok">ürün-özel</span> : r.source === 'GLOBAL' ? <span className="tagp info">global</span> : <span className="tagp risk">tanımsız</span>}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={FIELDS.length + 3} className="muted" style={{ padding: 14 }}>Eşleşen ürün yok.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
