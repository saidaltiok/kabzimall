'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';
import SectionTabs, { COST_TABS } from '@/components/SectionTabs';
import { ProductPicker, CategoryPicker } from '@/components/pickers';

interface Rule {
  id: string;
  scope: string;
  refId: string;
  strategy: string | null;
  targetMargin: number | null;
  floorMargin: number | null;
  psychological: boolean;
}

const SCOPES: [string, string][] = [
  ['GLOBAL', 'Tüm ürünler (global)'],
  ['CATEGORY', 'Kategori'],
  ['PRODUCT', 'Ürün'],
];
const STRATEGIES: [string, string][] = [
  ['', '— (çağrı belirler)'],
  ['MARGIN', 'Hedef marj'],
  ['HAL_MARKUP', 'Hal + %'],
  ['COMP_AVG', 'Rakip ortalaması'],
  ['COMP_AVG_MINUS', 'Rakip ort. − %'],
  ['MEDIAN', 'Medyan'],
  ['LOWEST', 'En düşük'],
  ['GROUP_AVG', 'Grup ortalaması'],
  ['FLOOR', 'Taban marj'],
];
const scopeLabel = (s: string) => SCOPES.find((x) => x[0] === s)?.[1] ?? s;
const stratLabel = (s: string | null) => (s ? STRATEGIES.find((x) => x[0] === s)?.[1] ?? s : '—');
const pctStr = (v: number | null) => (v != null ? `%${Math.round(v * 100)}` : '—');

const empty = { scope: 'CATEGORY', refId: '', strategy: '', targetTl: '', floorTl: '', psychological: true };

export default function KurallarPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [names, setNames] = useState<Record<string, string>>({}); // slug → ad (tabloda slug yerine ad göster)

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ data: Rule[] }>('/intel/pricing-rules');
      setRules(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([
      apiGet<{ data: { slug: string; name: string }[] }>('/catalog/products').catch(() => ({ data: [] })),
      apiGet<{ data: { slug: string; name: string }[] }>('/catalog/categories').catch(() => ({ data: [] })),
    ]).then(([p, c]) => {
      const m: Record<string, string> = {};
      for (const x of [...p.data, ...c.data]) m[x.slug] = x.name;
      setNames(m);
    });
  }, []);

  const pctToRate = (v: string) => (v.trim() === '' ? undefined : Math.round(parseFloat(v.replace(',', '.'))) / 100);

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      const payload = {
        scope: form.scope,
        refId: form.scope === 'GLOBAL' ? undefined : form.refId.trim(),
        strategy: form.strategy || undefined,
        targetMargin: pctToRate(form.targetTl),
        floorMargin: pctToRate(form.floorTl),
        psychological: form.psychological,
      };
      await apiSend('PUT', '/intel/pricing-rules', payload);
      setOk('✓ Kural kaydedildi.');
      setForm({ ...empty });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Kural silinsin mi?')) return;
    try { await apiSend('DELETE', `/intel/pricing-rules/${id}`); await load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Topbar title="Fiyat Kuralları" sub="Kalıcı strateji + hedef/taban marj" />
      <div className="body">
        <SectionTabs tabs={COST_TABS} />
        <p className="hint">
          Ürün/kategori/global bazlı kalıcı kurallar. Öneri motoru, çağrıda belirtilmeyen alanlar için
          bu kuralları <b>varsayılan</b> kabul eder; en-spesifik kazanır (<b>Ürün &gt; Kategori &gt; Global</b>).
          Örn. sebzede taban marj <b>%25</b>, yöreselde <b>%40</b>. Taban marj altına motor asla inmez.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">Kural ekle / güncelle</div>
          <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field">
              <label>Kapsam</label>
              <select value={form.scope} onChange={(e) => setForm((s) => ({ ...s, scope: e.target.value }))}>
                {SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {form.scope !== 'GLOBAL' && (
              <div className="field" style={{ minWidth: 220 }}>
                <label>{form.scope === 'CATEGORY' ? 'Kategori' : 'Ürün'}</label>
                {form.scope === 'CATEGORY'
                  ? <CategoryPicker value={form.refId} onChange={(v) => setForm((s) => ({ ...s, refId: v }))} />
                  : <ProductPicker value={form.refId} onChange={(v) => setForm((s) => ({ ...s, refId: v }))} />}
              </div>
            )}
            <div className="field">
              <label>Strateji (ops.)</label>
              <select value={form.strategy} onChange={(e) => setForm((s) => ({ ...s, strategy: e.target.value }))}>
                {STRATEGIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Hedef marj (%)</label>
              <input value={form.targetTl} onChange={(e) => setForm((s) => ({ ...s, targetTl: e.target.value }))} placeholder="30" style={{ width: 80 }} />
            </div>
            <div className="field">
              <label>Taban marj (%)</label>
              <input value={form.floorTl} onChange={(e) => setForm((s) => ({ ...s, floorTl: e.target.value }))} placeholder="25" style={{ width: 80 }} />
            </div>
            <div className="field">
              <label>Psikolojik</label>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={form.psychological} onChange={(e) => setForm((s) => ({ ...s, psychological: e.target.checked }))} /> ,90 yuvarla</label>
            </div>
            <button className="btn" onClick={save} disabled={busy || (form.scope !== 'GLOBAL' && !form.refId.trim())}>Kaydet</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Tanımlı kurallar <span>{rules.length}</span></div>
          {rules.length === 0 ? (
            <p className="muted">Henüz kural yok. Global bir taban marj ile başlayabilirsin.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Kapsam</th><th>Hedef</th><th>Strateji</th><th className="num">Hedef marj</th><th className="num">Taban marj</th><th>Psikolojik</th><th></th></tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td><span className="tagp info">{scopeLabel(r.scope)}</span></td>
                    <td>{r.scope === 'GLOBAL' ? '—' : <b>{names[r.refId] ?? r.refId}</b>}</td>
                    <td>{stratLabel(r.strategy)}</td>
                    <td className="num">{pctStr(r.targetMargin)}</td>
                    <td className="num savecell">{pctStr(r.floorMargin)}</td>
                    <td>{r.psychological ? '✓' : '—'}</td>
                    <td className="num"><button className="btn ghost" style={{ padding: '5px 9px', color: 'var(--berry)' }} onClick={() => remove(r.id)}>Sil</button></td>
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
