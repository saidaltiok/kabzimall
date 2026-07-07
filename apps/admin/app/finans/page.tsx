'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { COST_TABS } from '@/components/SectionTabs';
import { tlToKurus } from '@/lib/money';

interface Overhead {
  id: string; name: string; category: string; kind: 'FIXED' | 'RATE';
  amount: number; rate: number; period: string; incurredAt: string | null; isActive: boolean;
}
interface Pnl {
  from: string; to: string; days: number; orderCount: number;
  revenue: number; refundTotal: number; netRevenue: number; cogs: number; grossProfit: number;
  overheadTotal: number; overheadBreakdown: { name: string; category: string; kind: string; amountInRange: number }[];
  net: number; missingCost: string[];
}

const CATS: [string, string][] = [
  ['RENT', 'Kira'], ['PACKAGING', 'Ambalaj'], ['LABOR', 'İşçilik'], ['FUEL', 'Yakıt'], ['COMMISSION', 'Kart komisyonu'], ['OTHER', 'Diğer'],
];
const catLabel = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? c;

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

export default function FinansPage() {
  const [rows, setRows] = useState<Overhead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // gider formu
  const [name, setName] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [kind, setKind] = useState<'FIXED' | 'RATE'>('FIXED');
  const [amountTl, setAmountTl] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [period, setPeriod] = useState('MONTHLY');
  // K/Z
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [pnlBusy, setPnlBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<{ data: Overhead[] }>('/intel/finance/overheads').then((r) => setRows(r.data)).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addOverhead() {
    setBusy(true); setError(null); setOk(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), category, kind, period };
      if (kind === 'FIXED') body.amount = (tlToKurus(amountTl) ?? 0);
      else body.rate = parseFloat(ratePct.replace(',', '.')) / 100;
      await apiSend('POST', '/intel/finance/overheads', body);
      setOk('✓ Gider eklendi.');
      setName(''); setAmountTl(''); setRatePct('');
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function toggle(o: Overhead) {
    try { await apiSend('PATCH', `/intel/finance/overheads/${o.id}`, { isActive: !o.isActive }); load(); } catch (e) { setError((e as Error).message); }
  }
  async function remove(o: Overhead) {
    if (!window.confirm(`"${o.name}" gideri silinsin mi?`)) return;
    try { await apiSend('DELETE', `/intel/finance/overheads/${o.id}`); load(); } catch (e) { setError((e as Error).message); }
  }

  async function calcPnl() {
    setPnlBusy(true); setError(null);
    try {
      setPnl(await apiGet<Pnl>(`/intel/finance/pnl?from=${from}&to=${to}`));
    } catch (e) { setError((e as Error).message); } finally { setPnlBusy(false); }
  }

  return (
    <>
      <Topbar title="Finans" sub="Genel giderler + tarih aralığı kâr/zarar" />
      <div className="body">
        <SectionTabs tabs={COST_TABS} />
        <p className="hint">
          <b>Ürüne bağlı</b> girdiler (fire, işçilik/birim…) birim maliyette (Maliyet & Fire ekranı).
          <b> Üründen bağımsız</b> giderler (kira, ambalaj toplu alım, <b>kart komisyonu</b>) burada;
          birim fiyata girmez, yalnız kâr/zarara yansır. Komisyon gibi ciroya bağlı gider için <b>oranlı</b> tipi kullan.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        {/* Kâr / Zarar */}
        <div className="card">
          <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Kâr / Zarar
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ fontSize: 12 }} />
            <span className="muted">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ fontSize: 12 }} />
            <button className="btn" disabled={pnlBusy} onClick={calcPnl}>{pnlBusy ? '…' : 'Hesapla'}</button>
            <button className="btn ghost" onClick={() => { setFrom(monthStart()); setTo(today()); }}>Bu ay</button>
          </div>
          {!pnl ? (
            <p className="muted">Tarih aralığı seçip <b>Hesapla</b>&apos;ya bas.</p>
          ) : (
            <div className="calcgrid">
              <div>
                <table>
                  <tbody>
                    <tr><td>Ciro (teslim edilen {pnl.orderCount} sipariş)</td><td className="num savecell">{tl(pnl.revenue)}</td></tr>
                    {pnl.refundTotal > 0 && (
                      <>
                        <tr><td>− İadeler (kısmi)</td><td className="num" style={{ color: 'var(--berry)' }}>−{tl(pnl.refundTotal)}</td></tr>
                        <tr><td><b>Net ciro</b></td><td className="num"><b>{tl(pnl.netRevenue)}</b></td></tr>
                      </>
                    )}
                    <tr><td>− Ürün maliyeti (COGS)</td><td className="num">−{tl(pnl.cogs)}</td></tr>
                    <tr style={{ borderTop: '1px solid var(--line)' }}><td><b>Brüt kâr</b></td><td className="num"><b>{tl(pnl.grossProfit)}</b></td></tr>
                    {pnl.overheadBreakdown.map((b, i) => (
                      <tr key={i}><td className="muted" style={{ fontSize: 12 }}>− {b.name} ({catLabel(b.category)}{b.kind === 'RATE' ? ', oranlı' : ''})</td><td className="num muted">−{tl(b.amountInRange)}</td></tr>
                    ))}
                    <tr><td>− Genel gider toplamı</td><td className="num">−{tl(pnl.overheadTotal)}</td></tr>
                    <tr style={{ borderTop: '2px solid var(--forest)' }}>
                      <td><b>Net {pnl.net >= 0 ? 'kâr' : 'zarar'}</b></td>
                      <td className="num savecell" style={{ color: pnl.net >= 0 ? 'var(--forest)' : 'var(--berry)', fontWeight: 700 }}>{tl(pnl.net)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  {pnl.days} gün · sabit aylık giderler güne prorata, oranlı giderler ciroya uygulanır.
                  {pnl.missingCost.length > 0 && <> · ⚠️ Maliyeti tanımsız (COGS dışı): {pnl.missingCost.join(', ')}</>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Genel giderler */}
        <div className="card" style={{ maxWidth: 820 }}>
          <div className="ct">Genel gider ekle</div>
          <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field"><label>Ad</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kira / Ambalaj / Kart komisyonu" /></div>
            <div className="field"><label>Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            <div className="field"><label>Tip</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as 'FIXED' | 'RATE')}>
                <option value="FIXED">Sabit tutar</option>
                <option value="RATE">Oranlı (ciro %)</option>
              </select>
            </div>
            {kind === 'FIXED' ? (
              <>
                <div className="field"><label>Tutar (₺)</label><input value={amountTl} onChange={(e) => setAmountTl(e.target.value)} placeholder="20000" style={{ width: 110 }} /></div>
                <div className="field"><label>Dönem</label>
                  <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                    <option value="MONTHLY">Aylık</option>
                    <option value="ONE_TIME">Tek seferlik</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="field"><label>Oran (%)</label><input value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder="3" style={{ width: 80 }} /></div>
            )}
            <button className="btn" onClick={addOverhead} disabled={busy || !name.trim() || (kind === 'FIXED' ? !amountTl.trim() : !ratePct.trim())}>Ekle</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Genel giderler <span>{rows.length}</span></div>
          {rows.length === 0 ? <p className="muted">Henüz genel gider yok.</p> : (
            <table>
              <thead><tr><th>Ad</th><th>Kategori</th><th>Tip</th><th className="num">Tutar / Oran</th><th>Dönem</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} style={o.isActive ? undefined : { opacity: 0.5 }}>
                    <td><b>{o.name}</b></td>
                    <td>{catLabel(o.category)}</td>
                    <td>{o.kind === 'RATE' ? 'Oranlı' : 'Sabit'}</td>
                    <td className="num">{o.kind === 'RATE' ? `%${(o.rate * 100).toLocaleString('tr-TR')}` : tl(o.amount)}</td>
                    <td>{o.kind === 'RATE' ? 'ciro' : o.period === 'ONE_TIME' ? 'tek sefer' : 'aylık'}</td>
                    <td>{o.isActive ? <span className="tagp ok">aktif</span> : <span className="tagp info">kapalı</span>}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggle(o)}>{o.isActive ? 'Kapat' : 'Aç'}</button>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px', marginLeft: 6, color: 'var(--berry)' }} onClick={() => remove(o)}>Sil</button>
                    </td>
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
