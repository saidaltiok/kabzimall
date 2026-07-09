'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { SETTINGS_TABS } from '@/components/SectionTabs';
import { tlToKurus } from '@/lib/money';

interface Coupon {
  id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number;
  minSubtotal: number; expiresAt: string | null; maxUses: number | null;
  usedCount: number; isActive: boolean; firstOrderOnly: boolean; createdAt: string;
}

export default function KuponlarPage() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // yeni kupon formu
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');
  const [minTl, setMinTl] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);

  const load = useCallback(() => {
    apiGet<{ data: Coupon[] }>('/admin/coupons').then((r) => setRows(r.data)).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setError(null); setOk(null);
    try {
      const v = parseFloat(value.replace(',', '.'));
      if (!Number.isFinite(v) || v <= 0) throw new Error('Geçerli bir değer girin.');
      const fixedKurus = tlToKurus(value); // FIXED ₺ → kuruş (binlik ayraç toleranslı)
      await apiSend('POST', '/admin/coupons', {
        code: code.trim(),
        type,
        value: type === 'PERCENT' ? Math.round(v) : (fixedKurus ?? 0),
        minSubtotal: tlToKurus(minTl) ?? 0,
        maxUses: maxUses.trim() ? parseInt(maxUses, 10) : undefined,
        expiresAt: expires ? new Date(expires + 'T23:59:59').toISOString() : undefined,
        firstOrderOnly,
      });
      setOk(`✓ Kupon oluşturuldu: ${code.trim().toUpperCase()}`);
      setCode(''); setValue(''); setMinTl(''); setMaxUses(''); setExpires(''); setFirstOrderOnly(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Coupon) {
    setError(null);
    try {
      await apiSend('PATCH', `/admin/coupons/${c.id}/active`, { isActive: !c.isActive });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Topbar title="Kuponlar" sub="Kampanya kuponları — indirim sunucuda hesaplanır" />
      <div className="body">
        <SectionTabs tabs={SETTINGS_TABS} />
        <p className="hint">
          Kupon, sepette müşterinin girdiği kodla uygulanır: <b>yüzde</b> ya da <b>sabit tutar (₺)</b> indirim.
          Asgari sepet, son kullanma ve kullanım limiti opsiyoneldir. Kullanım sayacı sipariş anında atomik artar.
        </p>

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 720 }}>
          <div className="ct">Yeni kupon</div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="field"><label>Kod</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HOSGELDIN10" style={{ textTransform: 'uppercase' }} /></div>
            <div className="field"><label>Tür</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')}>
                <option value="PERCENT">Yüzde (%)</option>
                <option value="FIXED">Sabit tutar (₺)</option>
              </select>
            </div>
            <div className="field"><label>{type === 'PERCENT' ? 'Yüzde (1-100)' : 'Tutar (₺)'}</label><input value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'PERCENT' ? '10' : '50,00'} style={{ width: 110 }} /></div>
            <div className="field"><label>Asgari sepet (₺, ops.)</label><input value={minTl} onChange={(e) => setMinTl(e.target.value)} placeholder="200,00" style={{ width: 120 }} /></div>
            <div className="field"><label>Kullanım limiti (ops.)</label><input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="100" style={{ width: 100 }} /></div>
            <div className="field"><label>Son kullanma (ops.)</label><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirstOrderOnly(e.target.checked)} /> Yalnız ilk siparişe
              </label>
            </div>
            <button className="btn" onClick={create} disabled={busy || !code.trim() || !value.trim()}>{busy ? '…' : 'Oluştur'}</button>
          </div>
          <p className="note2" style={{ marginTop: 8 }}>
            <b>Yalnız ilk siparişe:</b> Aynı <b>telefon veya e-posta</b> ile daha önce (iptal olmayan) sipariş verilmişse
            kupon reddedilir. Kontrol sipariş anında sunucuda yapılır (misafir siparişlerde de çalışır).
          </p>
        </div>

        <div className="card">
          <div className="ct">Kuponlar <span>{rows.length}</span></div>
          {rows.length === 0 ? (
            <p className="muted">Henüz kupon yok.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Kod</th><th>İndirim</th><th className="num">Asgari sepet</th><th className="num">Kullanım</th><th>Son kullanma</th><th>Kapsam</th><th>Durum</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.5 }}>
                    <td><b>{c.code}</b></td>
                    <td>{c.type === 'PERCENT' ? `%${c.value}` : tl(c.value)}</td>
                    <td className="num">{c.minSubtotal > 0 ? tl(c.minSubtotal) : '—'}</td>
                    <td className="num">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ''}</td>
                    <td>{c.expiresAt ? c.expiresAt.slice(0, 10) : '—'}</td>
                    <td>{c.firstOrderOnly ? <span className="tagp info" title="Yalnız ilk siparişte geçerli">ilk sipariş</span> : <span className="muted">herkes</span>}</td>
                    <td>{c.isActive ? <span className="tagp ok">aktif</span> : <span className="tagp info">kapalı</span>}</td>
                    <td className="num">
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggle(c)}>
                        {c.isActive ? 'Kapat' : 'Aç'}
                      </button>
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
