'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { COST_TABS } from '@/components/SectionTabs';

interface Row {
  slug: string; name: string; unitLabel: string | null; category: string | null;
  source: 'PRODUCT' | 'GLOBAL' | null; halAvg: number | null; directCost: number | null;
  components: { fireRate: number; labor: number; packaging: number; fuel: number; coldStorage: number; amortization: number } | null;
}
/** Satır düzenleme durumu (TL/% string olarak). */
interface EditRow { fire: string; labor: string; pack: string; fuel: string }

const k2 = (k: number) => (k / 100).toFixed(2);

export default function MaliyetTabloPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiGet<{ data: Row[] }>('/intel/cost-components/table');
      setRows(r.data);
      setEdits(Object.fromEntries(r.data.map((row) => [row.slug, row.components ? {
        fire: String(Math.round(row.components.fireRate * 100)),
        labor: k2(row.components.labor), pack: k2(row.components.packaging), fuel: k2(row.components.fuel),
      } : { fire: '', labor: '', pack: '', fuel: '' }])));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => !q || r.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))),
    [rows, q],
  );

  /** Girdisi orijinalden farklı satırlar (yalnız onlar kaydedilir). */
  const changed = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const e = edits[r.slug];
      if (!e || !r.components) continue;
      if (e.fire !== String(Math.round(r.components.fireRate * 100)) || e.labor !== k2(r.components.labor) || e.pack !== k2(r.components.packaging) || e.fuel !== k2(r.components.fuel)) {
        out.push(r.slug);
      }
    }
    return out;
  }, [rows, edits]);

  const set = (slug: string, key: keyof EditRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEdits((s) => ({ ...s, [slug]: { ...s[slug], [key]: e.target.value } }));

  async function saveChanged() {
    setBusy(true); setError(null); setOk(null);
    const tl2k = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100);
    let saved = 0;
    try {
      for (const slug of changed) {
        const e = edits[slug];
        const orig = rows.find((r) => r.slug === slug)!.components!;
        await apiSend('PUT', '/intel/cost-components', {
          scope: 'PRODUCT', refId: slug,
          fireRate: parseFloat(e.fire.replace(',', '.')) / 100,
          labor: tl2k(e.labor), packaging: tl2k(e.pack), fuel: tl2k(e.fuel),
          coldStorage: orig.coldStorage, amortization: orig.amortization,
          commissionRate: 0, // komisyon genel giderde (Finans) — birim maliyete girmez
        });
        saved++;
      }
      setOk(`✓ ${saved} ürünün maliyet girdisi kaydedildi (PRODUCT kapsamı).`);
      await load();
    } catch (e) {
      setError(`${saved} kaydedildi, sonra hata: ${(e as Error).message}`);
      await load();
    } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Maliyet Tablosu" sub="Tüm ürünlerin girdileri tek tabloda — değiştir, toplu kaydet" />
      <div className="body">
        <SectionTabs tabs={COST_TABS} />
        <p className="hint">
          Hücreyi değiştir → <b>Değişenleri kaydet</b>. Kaydedilen satır ürün-özel (PRODUCT) girdi olur;
          dokunulmayanlar GLOBAL varsayılanı kullanmaya devam eder. Kart komisyonu burada yok —
          <b> Finans → Genel Giderler</b>&apos;de (ciroya oranlı) tutulur.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <div className="form-row" style={{ alignItems: 'center' }}>
            <div className="field" style={{ maxWidth: 240 }}><label>Ara</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ürün adı…" /></div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>{changed.length} satır değişti</span>
              <button className="btn" disabled={busy || changed.length === 0} onClick={saveChanged}>{busy ? '…' : 'Değişenleri kaydet'}</button>
            </div>
          </div>
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          {rows.length === 0 ? <p className="muted">Yükleniyor…</p> : (
            <table style={{ minWidth: 760, fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Ürün</th><th className="num">Hal</th>
                  <th className="num">Fire %</th><th className="num">İşçilik ₺</th><th className="num">Ambalaj ₺</th><th className="num">Yakıt ₺</th>
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
                      {(['fire', 'labor', 'pack', 'fuel'] as const).map((k) => (
                        <td className="num" key={k}>
                          <input className="cell" style={{ width: 62, textAlign: 'right' }} value={e?.[k] ?? ''} onChange={set(r.slug, k)} disabled={!r.components} />
                        </td>
                      ))}
                      <td className="num">{r.directCost != null ? <b>{tl(r.directCost)}</b> : <span className="muted" title="Hal verisi yok">—</span>}</td>
                      <td>{r.source === 'PRODUCT' ? <span className="tagp ok">ürün-özel</span> : r.source === 'GLOBAL' ? <span className="tagp info">global</span> : <span className="tagp risk">tanımsız</span>}</td>
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
