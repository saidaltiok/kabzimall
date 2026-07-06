'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import { tlToKurus } from '@/lib/money';
import Topbar from '@/components/Topbar';

interface Session {
  id: string; openingFloat: number; openedBy: string | null; openedAt: string;
  closedAt: string | null; countedClose: number | null; expectedClose: number | null; note: string | null;
}
interface Movement { id: string; type: 'IN' | 'OUT'; category: string; amount: number; note: string | null; refCode: string | null; createdAt: string }
interface Current { session: Session | null; movements?: Movement[]; totals?: { inSum: number; outSum: number; balance: number } }
interface PastSession extends Session { inSum: number; outSum: number; movementCount: number; expected: number; variance: number | null }

const CATS: [string, string][] = [
  ['SALE', 'Satış tahsilatı'], ['HAL_PURCHASE', 'Hal alımı'], ['EXPENSE', 'Masraf'],
  ['DEPOSIT', 'Kasaya para koyma'], ['WITHDRAWAL', 'Kasadan para alma'], ['OTHER', 'Diğer'],
];
const catLabel = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? c;

export default function KasaPage() {
  const [cur, setCur] = useState<Current | null>(null);
  const [past, setPast] = useState<PastSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openTl, setOpenTl] = useState('');
  const [mType, setMType] = useState<'IN' | 'OUT'>('OUT');
  const [mCat, setMCat] = useState('EXPENSE');
  const [mTl, setMTl] = useState('');
  const [mNote, setMNote] = useState('');
  const [countTl, setCountTl] = useState('');

  const load = useCallback(() => {
    apiGet<Current>('/admin/cash/current').then(setCur).catch((e) => setError((e as Error).message));
    apiGet<{ data: PastSession[] }>('/admin/cash/sessions').then((r) => setPast(r.data.filter((s) => s.closedAt))).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const toK = (v: string) => tlToKurus(v) ?? 0;

  async function openRegister() {
    setBusy(true); setError(null); setOk(null);
    try { await apiSend('POST', '/admin/cash/open', { openingFloat: toK(openTl || '0') }); setOk('✓ Kasa açıldı.'); setOpenTl(''); load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addMovement() {
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('POST', '/admin/cash/movements', { type: mType, category: mCat, amount: toK(mTl), note: mNote.trim() || undefined });
      setMTl(''); setMNote(''); load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function closeRegister() {
    if (!window.confirm('Kasa kapatılsın mı? Kapanış sonrası bu oturuma hareket eklenemez.')) return;
    setBusy(true); setError(null); setOk(null);
    try {
      const r = await apiSend<Session>('POST', '/admin/cash/close', { counted: toK(countTl) });
      const variance = (r.countedClose ?? 0) - (r.expectedClose ?? 0);
      setOk(`✓ Kasa kapandı. Beklenen ${tl(r.expectedClose ?? 0)}, sayılan ${tl(r.countedClose ?? 0)}, fark ${tl(variance)}.`);
      setCountTl(''); load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const s = cur?.session;
  return (
    <>
      <Topbar title="Kasa" sub="Açılış → hareketler → kapanış/sayım · teslimatlar ve hal alımları otomatik düşer" />
      <div className="body">
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        {!cur ? <p className="muted">Yükleniyor…</p> : !s ? (
          <div className="card" style={{ maxWidth: 460 }}>
            <div className="ct">Kasa kapalı — aç</div>
            <p className="muted" style={{ fontSize: 12.5 }}>
              Açılış bakiyesini gir (kasadaki nakit). Kasa açıkken teslim edilen siparişler otomatik <b>giriş</b>,
              hal alımları otomatik <b>çıkış</b> olarak düşer.
            </p>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="field"><label>Açılış bakiyesi (₺)</label><input value={openTl} onChange={(e) => setOpenTl(e.target.value)} placeholder="500,00" style={{ width: 130 }} /></div>
              <button className="btn" onClick={openRegister} disabled={busy || !openTl.trim()}>Kasayı aç</button>
            </div>
          </div>
        ) : (
          <>
            <div className="kpis">
              <div className="kpi"><div className="l">Anlık kasa</div><div className="v">{tl(cur.totals!.balance)}</div><div className="d">açılış {tl(s.openingFloat)} · {dt(s.openedAt)}</div></div>
              <div className="kpi"><div className="l">Girişler</div><div className="v" style={{ color: 'var(--forest)' }}>+{tl(cur.totals!.inSum)}</div><div className="d">satış + elle giriş</div></div>
              <div className="kpi"><div className="l">Çıkışlar</div><div className="v" style={{ color: 'var(--berry)' }}>−{tl(cur.totals!.outSum)}</div><div className="d">hal alımı + masraf</div></div>
            </div>

            <div className="grid2" style={{ marginTop: 14 }}>
              <div className="card">
                <div className="ct">Hareket ekle</div>
                <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="field"><label>Yön</label>
                    <select value={mType} onChange={(e) => { const t = e.target.value as 'IN' | 'OUT'; setMType(t); setMCat(t === 'IN' ? 'DEPOSIT' : 'EXPENSE'); }}>
                      <option value="OUT">Çıkış (−)</option>
                      <option value="IN">Giriş (+)</option>
                    </select>
                  </div>
                  <div className="field"><label>Kategori</label>
                    <select value={mCat} onChange={(e) => setMCat(e.target.value)}>
                      {CATS.filter(([v]) => (mType === 'IN' ? ['SALE', 'DEPOSIT', 'OTHER'] : ['HAL_PURCHASE', 'EXPENSE', 'WITHDRAWAL', 'OTHER']).includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Tutar (₺)</label><input value={mTl} onChange={(e) => setMTl(e.target.value)} placeholder="150,00" style={{ width: 100 }} /></div>
                  <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Not (ops.)</label><input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Poşet alımı" /></div>
                  <button className="btn" onClick={addMovement} disabled={busy || !mTl.trim()}>Ekle</button>
                </div>
              </div>

              <div className="card">
                <div className="ct">Kapanış / sayım</div>
                <p className="muted" style={{ fontSize: 12.5 }}>Kasadaki nakdi say, gir — beklenenle fark otomatik hesaplanır.</p>
                <div className="form-row" style={{ alignItems: 'flex-end' }}>
                  <div className="field"><label>Sayılan (₺)</label><input value={countTl} onChange={(e) => setCountTl(e.target.value)} placeholder={(cur.totals!.balance / 100).toFixed(2)} style={{ width: 120 }} /></div>
                  <button className="btn" style={{ background: 'var(--berry)' }} onClick={closeRegister} disabled={busy || !countTl.trim()}>Kasayı kapat</button>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="ct">Bu oturumun hareketleri <span>{cur.movements!.length}</span></div>
              {cur.movements!.length === 0 ? <p className="muted">Henüz hareket yok.</p> : (
                <table>
                  <thead><tr><th>Zaman</th><th>Kategori</th><th>Not / Referans</th><th className="num">Tutar</th></tr></thead>
                  <tbody>
                    {cur.movements!.map((m) => (
                      <tr key={m.id}>
                        <td className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{dt(m.createdAt)}</td>
                        <td>{catLabel(m.category)}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{m.note ?? ''}{m.refCode ? ` · ${m.refCode}` : ''}</td>
                        <td className="num" style={{ fontWeight: 700, color: m.type === 'IN' ? 'var(--forest)' : 'var(--berry)' }}>{m.type === 'IN' ? '+' : '−'}{tl(m.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {past.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="ct">Geçmiş oturumlar <span>{past.length}</span></div>
            <table>
              <thead><tr><th>Açılış</th><th>Kapanış</th><th className="num">Açılış ₺</th><th className="num">Giriş</th><th className="num">Çıkış</th><th className="num">Beklenen</th><th className="num">Sayılan</th><th className="num">Fark</th></tr></thead>
              <tbody>
                {past.map((p) => (
                  <tr key={p.id}>
                    <td className="muted" style={{ fontSize: 11.5 }}>{dt(p.openedAt)}</td>
                    <td className="muted" style={{ fontSize: 11.5 }}>{p.closedAt ? dt(p.closedAt) : '—'}</td>
                    <td className="num">{tl(p.openingFloat)}</td>
                    <td className="num" style={{ color: 'var(--forest)' }}>+{tl(p.inSum)}</td>
                    <td className="num" style={{ color: 'var(--berry)' }}>−{tl(p.outSum)}</td>
                    <td className="num">{tl(p.expected)}</td>
                    <td className="num">{p.countedClose != null ? tl(p.countedClose) : '—'}</td>
                    <td className="num" style={{ fontWeight: 700, color: (p.variance ?? 0) < 0 ? 'var(--berry)' : 'var(--forest)' }}>{p.variance != null ? tl(p.variance) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
