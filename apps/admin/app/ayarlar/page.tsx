'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface Tier { minSubtotal: number; fee: number }
interface Settings { minOrderTotal: number; deliveryTiers: Tier[] }

const toTl = (k: number) => (k ? (k / 100).toFixed(2) : '');
const toKurus = (v: string) => (v.trim() === '' ? 0 : Math.round(parseFloat(v.replace(',', '.')) * 100));

interface TierRow { minTl: string; feeTl: string }

export default function AyarlarPage() {
  const [minTl, setMinTl] = useState('');
  const [rows, setRows] = useState<TierRow[]>([]);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function apply(s: Settings) {
    setSaved(s);
    setMinTl(toTl(s.minOrderTotal));
    setRows(s.deliveryTiers.map((t) => ({ minTl: toTl(t.minSubtotal), feeTl: t.fee ? toTl(t.fee) : '0' })));
  }

  useEffect(() => {
    apiGet<Settings>('/admin/settings').then(apply).catch((e) => setError((e as Error).message));
  }, []);

  function setRow(i: number, patch: Partial<TierRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  const addRow = () => setRows((rs) => [...rs, { minTl: '', feeTl: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      const deliveryTiers = rows
        .filter((r) => r.minTl.trim() !== '' || r.feeTl.trim() !== '')
        .map((r) => ({ minSubtotal: toKurus(r.minTl), fee: toKurus(r.feeTl) }));
      const r = await apiSend<Settings>('PUT', '/admin/settings', { minOrderTotal: toKurus(minTl), deliveryTiers });
      apply(r);
      setOk('✓ Mağaza ayarları kaydedildi.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Mağaza Ayarları" sub="Sipariş & teslimat kuralları" />
      <div className="body">
        <p className="hint">
          Mağaza geneli kurallar (sunucuda zorunlu kılınır). Tutarlar <b>₺</b> girilir. Teslimat
          <b> kademeli</b>: sepet ara toplamının geçtiği <b>en yüksek</b> kademenin ücreti uygulanır
          (ücret <b>0</b> = ücretsiz). Her zaman bir <b>0&nbsp;₺+</b> temel kademe bulunur; eksikse otomatik eklenir.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 420 }}>
          <div className="ct">Asgari sipariş</div>
          <div className="field">
            <label>Asgari sipariş tutarı (₺, boş=yok)</label>
            <input value={minTl} onChange={(e) => setMinTl(e.target.value)} placeholder="150,00" />
          </div>
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <div className="ct">Teslimat kademeleri <span>{rows.length} kademe</span></div>
          <table>
            <thead>
              <tr><th>Sepet ara toplamı ≥ (₺)</th><th className="num">Teslimat ücreti (₺)</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input className="cell" style={{ width: 120, textAlign: 'left' }} value={r.minTl} onChange={(e) => setRow(i, { minTl: e.target.value })} placeholder="0" /></td>
                  <td className="num"><input className="cell" style={{ width: 110 }} value={r.feeTl} onChange={(e) => setRow(i, { feeTl: e.target.value })} placeholder="0 = ücretsiz" /></td>
                  <td className="num"><button className="btn ghost" style={{ padding: '5px 9px', color: 'var(--berry)' }} onClick={() => removeRow(i)} title="Kademeyi sil">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button className="btn ghost" onClick={addRow}>+ Kademe ekle</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
          {saved && (
            <p className="note2">
              Şu an: asgari <b>{saved.minOrderTotal > 0 ? tl(saved.minOrderTotal) : 'yok'}</b> · {' '}
              {saved.deliveryTiers.map((t, i) => (
                <span key={i}>{i > 0 && ' · '}<b>{tl(t.minSubtotal)}+</b> → {t.fee === 0 ? 'ücretsiz' : tl(t.fee)}</span>
              ))}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
