'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';

/** İletişim sayfası destek formu — talepler panelde kuyruğa düşer. */
export default function SupportForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await apiPost<{ message: string }>('/storefront/support', {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        orderCode: orderCode.trim() || undefined,
        message: message.trim(),
      });
      setDone(r.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="block" style={{ marginTop: 22, padding: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>💌</div>
        <b>{done}</b>
      </div>
    );
  }

  const input = { width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--line, #e2ded4)', fontSize: 14, fontFamily: 'inherit', background: '#fff' } as const;

  return (
    <form onSubmit={submit} style={{ marginTop: 22 }}>
      <h2 className="serif" style={{ fontSize: 18, marginBottom: 4 }}>Bize yazın</h2>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Talebiniz ekibimize düşer; e-posta bıraktıysanız yanıtı oraya göndeririz.</p>
      {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        <input style={input} placeholder="Adınız *" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input style={input} type="email" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={input} placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </div>
        <input style={input} placeholder="Sipariş kodu (varsa, KM…)" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} maxLength={16} />
        <textarea style={{ ...input, resize: 'vertical' }} rows={4} placeholder="Mesajınız *" value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={2000} />
        <button className="cta" type="submit" disabled={busy || !name.trim() || !message.trim() || (!email.trim() && !phone.trim())}>
          {busy ? 'Gönderiliyor…' : 'Gönder'}
        </button>
        {!email.trim() && !phone.trim() && <div className="muted" style={{ fontSize: 11.5 }}>Size dönebilmemiz için e-posta ya da telefondan en az birini girin.</div>}
      </div>
    </form>
  );
}
