'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';

interface Rule {
  id: string; scope: string; refId: string; mode: string; pct: number;
  staleDays: number; allowBelowCost: boolean; maxTotalOffPct: number; isActive: boolean;
}
interface RunResult {
  dryRun: boolean; ranAt: string;
  applied: { slug: string; name: string; category: string | null; daysStale: number; oldPrice: number; newPrice: number; mode: string; floored: string | null }[];
  cleared: { slug: string; name: string }[];
}

const MODES: [string, string][] = [
  ['PRICE_DECAY', 'Fiyatın %X’i / gün'],
  ['MARGIN_DECAY', 'Kârın %X’i / gün'],
  ['EXCLUDE', 'Hariç tut (istisna)'],
];
const modeLabel = (m: string) => MODES.find((x) => x[0] === m)?.[1] ?? m;

export default function OtomatikIndirimPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  // form
  const [scope, setScope] = useState('CATEGORY');
  const [refId, setRefId] = useState('');
  const [mode, setMode] = useState('PRICE_DECAY');
  const [pct, setPct] = useState('5');
  const [staleDays, setStaleDays] = useState('2');
  const [allowBelowCost, setAllowBelowCost] = useState(false);
  const [capPct, setCapPct] = useState('50');

  const load = useCallback(() => {
    apiGet<{ data: Rule[] }>('/intel/markdown/rules').then((r) => setRules(r.data)).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('PUT', '/intel/markdown/rules', {
        scope, refId: refId.trim(), mode,
        ...(mode !== 'EXCLUDE' ? {
          pct: parseFloat(pct.replace(',', '.')) / 100,
          staleDays: parseInt(staleDays, 10),
          allowBelowCost,
          maxTotalOffPct: parseFloat(capPct.replace(',', '.')) / 100,
        } : {}),
      });
      setOk('✓ Kural kaydedildi.');
      setRefId('');
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function toggle(r: Rule) {
    try { await apiSend('PUT', '/intel/markdown/rules', { scope: r.scope, refId: r.refId, isActive: !r.isActive }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function remove(r: Rule) {
    if (!window.confirm(`${r.refId} kuralı silinsin mi?`)) return;
    try { await apiSend('DELETE', `/intel/markdown/rules/${r.id}`); load(); } catch (e) { setError((e as Error).message); }
  }

  async function trigger(dry: boolean) {
    setBusy(true); setError(null); setOk(null);
    try {
      const r = await apiSend<RunResult>('POST', `/intel/markdown/run${dry ? '?dry=1' : ''}`);
      setRun(r);
      if (!dry) setOk(`✓ ${r.applied.length} indirim uygulandı, ${r.cleared.length} indirim temizlendi (restok).`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Otomatik İndirim" sub="Eriyen stok: yeni alım yapılmayan ürünlerde günlük indirim" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          <b>Yeni alım yapılmayan</b> (son alım/stok girişinden bu yana <b>bekleme günü</b> geçmiş) ama <b>stoğu süren</b>
          ürünler her sabah 08:30&apos;da kurala göre iner ve Fırsatlar&apos;a düşer. Taban fiyat değişmez — indirim
          <b> indirimli fiyata</b> yazılır; restok gelince kendiliğinden normale döner. Ürün istisnası için
          <b> Ürün + Hariç tut</b> kuralı ekle (ör. patates, soğan, yöreseller). En-spesifik kural kazanır.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 900 }}>
          <div className="ct">Kural ekle / güncelle</div>
          <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field"><label>Kapsam</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="CATEGORY">Kategori</option>
                <option value="PRODUCT">Ürün</option>
              </select>
            </div>
            <div className="field"><label>{scope === 'CATEGORY' ? 'Kategori slug' : 'Ürün slug'}</label>
              <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder={scope === 'CATEGORY' ? 'sebze' : 'patates'} />
            </div>
            <div className="field"><label>İndirim şekli</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {mode !== 'EXCLUDE' && (
              <>
                <div className="field"><label>Günlük %</label><input value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 60 }} /></div>
                <div className="field"><label>Bekleme (gün)</label><input value={staleDays} onChange={(e) => setStaleDays(e.target.value)} style={{ width: 60 }} /></div>
                <div className="field"><label>Toplam tavan %</label><input value={capPct} onChange={(e) => setCapPct(e.target.value)} style={{ width: 60 }} /></div>
                <div className="field"><label>Zararına</label>
                  <label style={{ fontSize: 13 }}><input type="checkbox" checked={allowBelowCost} onChange={(e) => setAllowBelowCost(e.target.checked)} /> izin ver</label>
                </div>
              </>
            )}
            <button className="btn" onClick={save} disabled={busy || !refId.trim()}>Kaydet</button>
          </div>
        </div>

        <div className="card">
          <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Kurallar <span>{rules.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn ghost" disabled={busy} onClick={() => trigger(true)}>👁️ Önizle (yazmaz)</button>
              <button className="btn" disabled={busy} onClick={() => trigger(false)}>▶️ Şimdi çalıştır</button>
            </div>
          </div>
          {rules.length === 0 ? <p className="muted">Kural yok. Örn: Kategori <b>sebze</b>, fiyatın %5&apos;i/gün, 2 gün bekleme.</p> : (
            <table>
              <thead><tr><th>Kapsam</th><th>Hedef</th><th>Şekil</th><th className="num">Günlük</th><th className="num">Bekleme</th><th className="num">Tavan</th><th>Zararına</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={r.isActive ? undefined : { opacity: 0.5 }}>
                    <td><span className="tagp info">{r.scope === 'CATEGORY' ? 'Kategori' : 'Ürün'}</span></td>
                    <td><b>{r.refId}</b></td>
                    <td>{modeLabel(r.mode)}</td>
                    <td className="num">{r.mode === 'EXCLUDE' ? '—' : `%${Math.round(r.pct * 100)}`}</td>
                    <td className="num">{r.mode === 'EXCLUDE' ? '—' : `${r.staleDays} gün`}</td>
                    <td className="num">{r.mode === 'EXCLUDE' ? '—' : `%${Math.round(r.maxTotalOffPct * 100)}`}</td>
                    <td>{r.mode === 'EXCLUDE' ? '—' : r.allowBelowCost ? '⚠️ evet' : 'hayır'}</td>
                    <td>{r.isActive ? <span className="tagp ok">aktif</span> : <span className="tagp info">kapalı</span>}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggle(r)}>{r.isActive ? 'Kapat' : 'Aç'}</button>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px', marginLeft: 6, color: 'var(--berry)' }} onClick={() => remove(r)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {run && (
          <div className="card">
            <div className="ct">{run.dryRun ? '👁️ Önizleme' : '▶️ Son koşu'} <span>{run.applied.length} indirim · {run.cleared.length} temizleme</span></div>
            {run.applied.length === 0 && run.cleared.length === 0 ? <p className="muted">Bugün inecek/temizlenecek ürün yok.</p> : (
              <>
                {run.applied.length > 0 && (
                  <table>
                    <thead><tr><th>Ürün</th><th className="num">Bayat (gün)</th><th className="num">Eski</th><th className="num">Yeni</th><th>Not</th></tr></thead>
                    <tbody>
                      {run.applied.map((a) => (
                        <tr key={a.slug}>
                          <td><b>{a.name}</b><span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{a.category ?? ''}</span></td>
                          <td className="num">{a.daysStale}</td>
                          <td className="num"><s>{tl(a.oldPrice)}</s></td>
                          <td className="num savecell">{tl(a.newPrice)}</td>
                          <td className="muted" style={{ fontSize: 11 }}>{a.floored === 'COST' ? 'maliyet tabanında durdu' : a.floored === 'CAP' ? 'toplam tavanda durdu' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {run.cleared.length > 0 && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>♻️ Restok — normale dönen: {run.cleared.map((c) => c.name).join(', ')}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
