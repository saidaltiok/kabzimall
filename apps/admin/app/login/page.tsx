'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { setSession, type SessionUser } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@kabzimall.local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { email, password });
      setSession(r.accessToken, r.user);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="leaf">🌿</div>
          <div>
            <div className="bm serif">Kabzı<b>Mall</b></div>
            <div className="sub">Intelligence</div>
          </div>
        </div>
        <h1 className="serif" style={{ fontSize: 22, margin: '4px 0 2px' }}>Panele giriş</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>Fiyat zekâsı yönetim paneli</p>

        {error && <div className="error">{error}</div>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>E-posta</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field" style={{ marginBottom: 18 }}>
          <label>Parola</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
        </div>

        <button className="applybtn" style={{ width: '100%' }} disabled={busy || !email || !password}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
        <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
          Geliştirme girişi: <b>admin@kabzimall.local</b> / <b>kabzimall123</b>
        </p>
      </form>
    </div>
  );
}
