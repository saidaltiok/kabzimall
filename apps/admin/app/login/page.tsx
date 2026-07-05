'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { setSession, type SessionUser } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@kabzimall.local');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
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
      <div className="login-shell">
        <aside className="login-hero">
          <div className="login-brand">
            <div className="leaf">🌿</div>
            <div>
              <div className="bm serif">Kabzı<b>Mall</b></div>
              <div className="sub">Intelligence</div>
            </div>
          </div>
          <h2 className="serif">Fiyat zekâsı, tek ekranda.</h2>
          <ul className="login-feats">
            <li><span>📈</span> Hal &amp; rakip fiyatları otomatik toplanır</li>
            <li><span>🎯</span> Maliyet korumalı fiyat önerisi</li>
            <li><span>🧾</span> Sipariş · paketleme · teslimat akışı</li>
          </ul>
          <div className="login-foot">Pilot bölge: Kadıköy · Tek kaynak: packages/pricing</div>
        </aside>

        <form className="login-card" onSubmit={submit}>
          <h1 className="serif">Panele giriş</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 2, marginBottom: 20 }}>Yönetim hesabınızla oturum açın.</p>

          {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

          <div className="field" style={{ marginBottom: 14 }}>
            <label>E-posta</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="ad@kabzimall.local" />
          </div>
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Parola</label>
            <div className="pw-wrap">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Parolayı gizle' : 'Parolayı göster'}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button className="applybtn" style={{ width: '100%' }} disabled={busy || !email || !password}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
          <div className="login-dev">
            Geliştirme girişi<br />
            <b>admin@kabzimall.local</b> / <b>kabzimall123</b>
          </div>
        </form>
      </div>
    </div>
  );
}
