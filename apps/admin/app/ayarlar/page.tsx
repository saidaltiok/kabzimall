'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';

export default function AyarlarPage() {
  const [minTl, setMinTl] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ minOrderTotal: number }>('/admin/settings')
      .then((s) => { setSaved(s.minOrderTotal); setMinTl(s.minOrderTotal ? (s.minOrderTotal / 100).toFixed(2) : ''); })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      const minOrderTotal = minTl.trim() === '' ? 0 : Math.round(parseFloat(minTl.replace(',', '.')) * 100);
      const r = await apiSend<{ minOrderTotal: number }>('PUT', '/admin/settings', { minOrderTotal });
      setSaved(r.minOrderTotal);
      setOk(r.minOrderTotal > 0 ? `✓ Asgari sipariş tutarı ${(r.minOrderTotal / 100).toFixed(2)} ₺ olarak kaydedildi.` : '✓ Asgari sipariş sınırı kaldırıldı.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Mağaza Ayarları" sub="Sipariş kuralları" />
      <div className="body">
        <p className="hint">
          Mağaza geneli sipariş kuralları. <b>Asgari sipariş tutarı</b>, müşterinin sepet ara
          toplamı bu tutarın altındaysa siparişi engeller (sunucuda zorunlu kılınır). <b>Boş ya da 0</b>
          bırakırsan sınır olmaz. Ürün başına azami miktar her ürün için <b>Ürün Kataloğu</b>&apos;ndan ayarlanır.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 460 }}>
          <div className="ct">Asgari sipariş tutarı</div>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label>Tutar (₺, boş=sınır yok)</label>
              <input value={minTl} onChange={(e) => setMinTl(e.target.value)} placeholder="150,00" onKeyDown={(e) => e.key === 'Enter' && save()} />
            </div>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
          <p className="note2">
            Şu anki kural: {saved == null ? '…' : saved > 0 ? <b>{(saved / 100).toFixed(2)} ₺ asgari</b> : <b>sınır yok</b>}.
          </p>
        </div>
      </div>
    </>
  );
}
