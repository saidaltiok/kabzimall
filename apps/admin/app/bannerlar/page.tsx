'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';
import SectionTabs, { SETTINGS_TABS } from '@/components/SectionTabs';

interface Banner {
  id: string; kicker: string | null; title: string; subtitle: string | null;
  couponCode: string | null; sortOrder: number; isActive: boolean; createdAt: string;
}

export default function BannerlarPage() {
  const [rows, setRows] = useState<Banner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kicker, setKicker] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const load = useCallback(() => {
    apiGet<{ data: Banner[] }>('/admin/banners').then((r) => setRows(r.data)).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('POST', '/admin/banners', {
        title: title.trim(),
        kicker: kicker.trim() || undefined,
        subtitle: subtitle.trim() || undefined,
        couponCode: couponCode.trim() || undefined,
        sortOrder: parseInt(sortOrder, 10) || 0,
      });
      setOk('✓ Banner oluşturuldu ve yayında.');
      setKicker(''); setTitle(''); setSubtitle(''); setCouponCode(''); setSortOrder('0');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(b: Banner) {
    setError(null);
    try {
      await apiSend('PATCH', `/admin/banners/${b.id}/active`, { isActive: !b.isActive });
      load();
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(b: Banner) {
    if (!window.confirm(`"${b.title}" banner'ı silinsin mi?`)) return;
    setError(null);
    try {
      await apiSend('DELETE', `/admin/banners/${b.id}`);
      load();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Topbar title="Banner" sub="Ana sayfa vitrin duyurusu — sırası en küçük aktif banner gösterilir" />
      <div className="body">
        <SectionTabs tabs={SETTINGS_TABS} />
        <p className="hint">
          Web sitesinin tepesindeki duyuru alanı buradan yönetilir. Kupon kodu bağlarsan müşteri
          banner'dan tek dokunuşla kodu kopyalar; kod <b>önce Kuponlar'da oluşturulmuş olmalı</b>.
          Hiç aktif banner yoksa site varsayılan karşılamayı gösterir.
        </p>

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 720 }}>
          <div className="ct">Yeni banner</div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="field"><label>Etiket (ops.)</label><input value={kicker} onChange={(e) => setKicker(e.target.value)} placeholder="Kampanya" style={{ width: 130 }} /></div>
            <div className="field" style={{ flex: 1, minWidth: 220 }}><label>Başlık</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="İlk siparişe %10 indirim" /></div>
          </div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}><label>Alt metin (ops.)</label><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Sepette kodu kullan, taze başla." /></div>
            <div className="field"><label>Kupon kodu (ops.)</label><input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="HOSGELDIN10" style={{ width: 140, textTransform: 'uppercase' }} /></div>
            <div className="field"><label>Sıra</label><input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: 60 }} /></div>
            <button className="btn" onClick={create} disabled={busy || !title.trim()}>{busy ? '…' : 'Oluştur'}</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Banner'lar <span>{rows.length}</span></div>
          {rows.length === 0 ? (
            <p className="muted">Henüz banner yok — site varsayılan karşılamayı gösteriyor.</p>
          ) : (
            <table>
              <thead>
                <tr><th className="num">Sıra</th><th>Banner</th><th>Kupon</th><th>Durum</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} style={b.isActive ? undefined : { opacity: 0.5 }}>
                    <td className="num">{b.sortOrder}</td>
                    <td>
                      {b.kicker && <span className="tagp info" style={{ marginRight: 6 }}>{b.kicker}</span>}
                      <b>{b.title}</b>
                      {b.subtitle && <div className="muted" style={{ fontSize: 11 }}>{b.subtitle}</div>}
                    </td>
                    <td>{b.couponCode ? <span className="tagp ok">🎟️ {b.couponCode}</span> : '—'}</td>
                    <td>{b.isActive ? <span className="tagp ok">yayında</span> : <span className="tagp info">kapalı</span>}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggle(b)}>{b.isActive ? 'Kaldır' : 'Yayınla'}</button>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px', marginLeft: 6, color: 'var(--berry)' }} onClick={() => remove(b)}>Sil</button>
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
