'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { dt } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { SETTINGS_TABS } from '@/components/SectionTabs';

interface User { id: string; email: string; name: string | null; role: string; createdAt: string }

const ROLE_META: Record<string, { label: string; hint: string }> = {
  ADMIN: { label: 'Yönetici', hint: 'her şey' },
  PRICE_MANAGER: { label: 'Fiyat Yöneticisi', hint: 'fiyat/kupon yazabilir' },
  OPERATION: { label: 'Operasyon', hint: 'sipariş + katalog' },
  PACKER: { label: 'Paketleyici', hint: 'paketleme + sipariş durumu' },
  COURIER: { label: 'Kurye', hint: 'teslimat durumu' },
  SUPPORT: { label: 'Destek', hint: 'sipariş görüntüleme + destek' },
  VIEWER: { label: 'İzleyici', hint: 'yalnız okuma' },
};

export default function KullanicilarPage() {
  const [rows, setRows] = useState<User[]>([]);
  const [me, setMe] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('PACKER');

  const load = useCallback(() => {
    apiGet<{ data: User[] }>('/auth/users').then((r) => setRows(r.data)).catch((e) => setError((e as Error).message));
    apiGet<{ email: string }>('/auth/me').then((r) => setMe(r.email)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('POST', '/auth/users', { email: email.trim(), password, name: name.trim() || undefined, role });
      setOk(`✓ Kullanıcı eklendi: ${email.trim()}`);
      setEmail(''); setName(''); setPassword(''); setRole('PACKER');
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function setUserRole(u: User, newRole: string) {
    setError(null); setOk(null);
    try {
      await apiSend('PATCH', `/auth/users/${u.id}`, { role: newRole });
      setOk(`✓ ${u.email} → ${ROLE_META[newRole]?.label ?? newRole}`);
      load();
    } catch (e) { setError((e as Error).message); load(); }
  }

  async function resetPassword(u: User) {
    const p = window.prompt(`${u.email} için yeni parola (en az 8 karakter):`);
    if (!p) return;
    setError(null); setOk(null);
    try {
      await apiSend('PATCH', `/auth/users/${u.id}`, { password: p });
      setOk(`✓ ${u.email} parolası güncellendi.`);
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(u: User) {
    if (!window.confirm(`${u.email} silinsin mi?`)) return;
    setError(null); setOk(null);
    try {
      await apiSend('DELETE', `/auth/users/${u.id}`);
      load();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Topbar title="Kullanıcılar & Roller" sub="Personel hesapları — her rol yalnız kendi ekranlarına yazabilir" />
      <div className="body">
        <SectionTabs tabs={SETTINGS_TABS} />
        <p className="hint">
          Roller yetkiyi belirler: {Object.entries(ROLE_META).map(([k, v]) => `${v.label} (${v.hint})`).join(' · ')}.
          Son yönetici düşürülemez/silinemez; kendi rolünüzü değiştiremezsiniz.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card" style={{ maxWidth: 760 }}>
          <div className="ct">Yeni kullanıcı</div>
          <div className="form-row" style={{ flexWrap: 'wrap' }}>
            <div className="field"><label>E-posta</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="paketci@kabzimall.local" /></div>
            <div className="field"><label>Ad (ops.)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Paketleme" style={{ width: 130 }} /></div>
            <div className="field"><label>Parola (≥8)</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: 140 }} /></div>
            <div className="field"><label>Rol</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(ROLE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button className="btn" onClick={create} disabled={busy || !email.trim() || password.length < 8}>{busy ? '…' : 'Ekle'}</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Kullanıcılar <span>{rows.length}</span></div>
          <table>
            <thead>
              <tr><th>E-posta</th><th>Ad</th><th>Rol</th><th>Eklendi</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.email}</b>{u.email === me && <span className="tagp info" style={{ marginLeft: 6 }}>siz</span>}</td>
                  <td>{u.name ?? '—'}</td>
                  <td>
                    <select value={u.role} disabled={u.email === me} onChange={(e) => setUserRole(u, e.target.value)} style={{ fontSize: 12, padding: '5px 7px' }}>
                      {Object.entries(ROLE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="muted" style={{ fontSize: 11.5 }}>{dt(u.createdAt)}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => resetPassword(u)}>Parola</button>
                    {u.email !== me && <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px', marginLeft: 6, color: 'var(--berry)' }} onClick={() => remove(u)}>Sil</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
