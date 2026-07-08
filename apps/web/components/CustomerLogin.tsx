'use client';

import { useState } from 'react';
import { apiPost, setCustomerSession } from '@/lib/api';

/** E-posta OTP girişi (şifresiz). Başarıda oturum kurulur ve onDone çağrılır. */
export default function CustomerLogin({ onDone, title = 'E-posta ile giriş' }: { onDone?: () => void; title?: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await apiPost<{ sent: boolean; devCode?: string }>('/storefront/auth/request-otp', { email: email.trim() });
      setSent(true);
      setInfo(r.devCode ? `Geliştirme modu — kodunuz: ${r.devCode}` : 'Giriş kodu e-postanıza gönderildi (5 dk geçerli).');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setErr(null);
    try {
      const r = await apiPost<{ token: string; email: string }>('/storefront/auth/verify-otp', { email: email.trim(), code: code.trim() });
      setCustomerSession(r.token, r.email);
      onDone?.();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="block" style={{ maxWidth: 460, margin: '0 auto' }}>
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 16 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
        Şifre yok — e-postana tek kullanımlık kod gönderelim. Girişte, bu e-postayla
        kayıtlı adreslerini ve siparişlerini her cihazdan görürsün.
      </p>
      {!sent ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="search" type="email" style={{ flex: 1, minWidth: 180 }} placeholder="ornek@eposta.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && send()} />
          <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 16px' }} disabled={busy || !email.includes('@')} onClick={send}>
            {busy ? 'Gönderiliyor…' : 'Kod gönder'}
          </button>
        </div>
      ) : (
        <>
          {info && <div className="note" style={{ marginBottom: 8 }}>{info}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="search" inputMode="numeric" maxLength={6} style={{ flex: 1, minWidth: 120, letterSpacing: 4, textAlign: 'center' }} placeholder="6 haneli kod" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code.trim().length === 6 && verify()} />
            <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 16px' }} disabled={busy || code.trim().length !== 6} onClick={verify}>
              {busy ? 'Doğrulanıyor…' : 'Giriş yap'}
            </button>
          </div>
          <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, marginTop: 8, padding: 0 }} onClick={() => { setSent(false); setCode(''); setInfo(null); }}>
            ← Farklı e-posta kullan
          </button>
        </>
      )}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}
