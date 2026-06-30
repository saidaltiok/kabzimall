'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';

interface Settings { minOrderTotal: number; deliveryFee: number; freeDeliveryThreshold: number }
const toTl = (k: number) => (k ? (k / 100).toFixed(2) : '');
const toKurus = (v: string) => (v.trim() === '' ? 0 : Math.round(parseFloat(v.replace(',', '.')) * 100));

export default function AyarlarPage() {
  const [minTl, setMinTl] = useState('');
  const [feeTl, setFeeTl] = useState('');
  const [freeTl, setFreeTl] = useState('');
  const [saved, setSaved] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function apply(s: Settings) {
    setSaved(s);
    setMinTl(toTl(s.minOrderTotal));
    setFeeTl(toTl(s.deliveryFee));
    setFreeTl(toTl(s.freeDeliveryThreshold));
  }

  useEffect(() => {
    apiGet<Settings>('/admin/settings').then(apply).catch((e) => setError((e as Error).message));
  }, []);

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      const payload = { minOrderTotal: toKurus(minTl), deliveryFee: toKurus(feeTl), freeDeliveryThreshold: toKurus(freeTl) };
      const r = await apiSend<Settings>('PUT', '/admin/settings', payload);
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
          Mağaza geneli kurallar (sunucuda zorunlu kılınır). Tutarlar <b>₺</b> girilir; <b>boş ya da 0</b>
          sınır/ücret yok demektir. Ürün başına azami miktar her ürün için <b>Ürün Kataloğu</b>&apos;ndan ayarlanır.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 520 }}>
          <div className="ct">Sipariş & teslimat</div>
          <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field">
              <label>Asgari sipariş (₺, boş=yok)</label>
              <input value={minTl} onChange={(e) => setMinTl(e.target.value)} placeholder="150,00" />
            </div>
            <div className="field">
              <label>Teslimat ücreti (₺)</label>
              <input value={feeTl} onChange={(e) => setFeeTl(e.target.value)} placeholder="49,90" />
            </div>
            <div className="field">
              <label>Ücretsiz teslimat eşiği (₺, 0=yok)</label>
              <input value={freeTl} onChange={(e) => setFreeTl(e.target.value)} placeholder="400,00" onKeyDown={(e) => e.key === 'Enter' && save()} />
            </div>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
          {saved && (
            <p className="note2">
              Şu an: asgari <b>{saved.minOrderTotal > 0 ? toTl(saved.minOrderTotal) + ' ₺' : 'yok'}</b> · teslimat <b>{toTl(saved.deliveryFee) || '0'} ₺</b>
              {saved.freeDeliveryThreshold > 0 ? <> · <b>{toTl(saved.freeDeliveryThreshold)} ₺</b> üstü ücretsiz</> : ' · ücretsiz eşik yok'}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
