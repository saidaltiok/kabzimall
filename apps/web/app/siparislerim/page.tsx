'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, customerSession, setCustomerSession, clearCustomerSession } from '@/lib/api';
import { tl } from '@/lib/format';
import { getOrderHistory, rememberOrder } from '@/lib/orders';

interface Order { id: string; code: string; status: string; grandTotal: number; deliveryWindow: string | null }

const LABEL: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const router = useRouter();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  // E-posta OTP oturumu — girişliyse siparişler SUNUCUDAN gelir (cihazdan bağımsız).
  const [session, setSession] = useState<{ token: string; email: string } | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);

  useEffect(() => { setSession(customerSession()); }, []);

  useEffect(() => {
    const load = async () => {
      // 1) Girişliyse: sunucudan e-postaya bağlı siparişler (+ bu cihazda kalanlar birleşir).
      let serverOrders: Order[] = [];
      if (session) {
        try {
          const r = await apiGet<{ data: Order[] }>('/storefront/my-orders', { Authorization: `Bearer ${session.token}` });
          serverOrders = r.data;
        } catch {
          // Oturum süresi dolmuş olabilir → sessizce çıkış, yerel liste kalır.
          clearCustomerSession();
          setSession(null);
        }
      }
      const refs = getOrderHistory().filter((r) => !serverOrders.some((o) => o.id === r.id));
      const localOrders = (await Promise.all(refs.map((r) => apiGet<Order>(`/storefront/orders/${r.id}`).catch(() => null)))).filter(Boolean) as Order[];
      setOrders([...serverOrders, ...localOrders]);
    };
    load();
  }, [session]);

  async function sendOtp() {
    setOtpBusy(true); setOtpErr(null); setOtpInfo(null);
    try {
      const r = await apiPost<{ sent: boolean; devCode?: string }>('/storefront/auth/request-otp', { email: loginEmail.trim() });
      setOtpSent(true);
      setOtpInfo(r.devCode
        ? `Geliştirme modu — kodunuz: ${r.devCode}` // canlıda SMTP açık → bu alan hiç gelmez
        : 'Giriş kodu e-postanıza gönderildi (5 dk geçerli).');
    } catch (e) {
      setOtpErr((e as Error).message);
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtp() {
    setOtpBusy(true); setOtpErr(null);
    try {
      const r = await apiPost<{ token: string; email: string }>('/storefront/auth/verify-otp', { email: loginEmail.trim(), code: otpCode.trim() });
      setCustomerSession(r.token, r.email);
      setSession({ token: r.token, email: r.email });
      setOtpSent(false); setOtpCode(''); setOtpInfo(null);
    } catch (e) {
      setOtpErr((e as Error).message);
    } finally {
      setOtpBusy(false);
    }
  }

  function logout() {
    clearCustomerSession();
    setSession(null);
  }

  async function lookup() {
    setBusy(true);
    setLookupErr(null);
    try {
      const o = await apiGet<Order>(`/storefront/orders/lookup?code=${encodeURIComponent(code.trim())}&phone=${encodeURIComponent(phone.trim())}`);
      rememberOrder(o.id, o.code);
      router.push(`/siparis/${o.id}`);
    } catch {
      setLookupErr('Sipariş bulunamadı. Kod ve telefonu kontrol edin.');
    } finally {
      setBusy(false);
    }
  }

  const loginForm = session ? (
    <div className="block" style={{ maxWidth: 460, margin: '0 auto 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13.5 }}>✓ Giriş yapıldı: <b>{session.email}</b></span>
      <button className="back" style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--berry)', fontSize: 13 }} onClick={logout}>Çıkış</button>
    </div>
  ) : (
    <div className="block" style={{ maxWidth: 460, margin: '0 auto 14px' }}>
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 16 }}>E-posta ile giriş</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>
        Şifre yok — e-postana tek kullanımlık kod gönderelim. Girişte, bu e-postayla verdiğin
        tüm siparişleri her cihazdan görürsün.
      </p>
      {!otpSent ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="search" type="email" style={{ flex: 1, minWidth: 180 }} placeholder="ornek@eposta.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loginEmail.includes('@') && sendOtp()} />
          <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 16px' }} disabled={otpBusy || !loginEmail.includes('@')} onClick={sendOtp}>
            {otpBusy ? 'Gönderiliyor…' : 'Kod gönder'}
          </button>
        </div>
      ) : (
        <>
          {otpInfo && <div className="note" style={{ marginBottom: 8 }}>{otpInfo}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="search" inputMode="numeric" maxLength={6} style={{ flex: 1, minWidth: 120, letterSpacing: 4, textAlign: 'center' }} placeholder="6 haneli kod" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && otpCode.trim().length === 6 && verifyOtp()} />
            <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 16px' }} disabled={otpBusy || otpCode.trim().length !== 6} onClick={verifyOtp}>
              {otpBusy ? 'Doğrulanıyor…' : 'Giriş yap'}
            </button>
          </div>
          <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, marginTop: 8, padding: 0 }} onClick={() => { setOtpSent(false); setOtpCode(''); setOtpInfo(null); }}>
            ← Farklı e-posta kullan
          </button>
        </>
      )}
      {otpErr && <div className="error" style={{ marginTop: 10 }}>{otpErr}</div>}
    </div>
  );

  const lookupForm = (
    <div className="block" style={{ maxWidth: 460, margin: '0 auto 22px' }}>
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 16 }}>Sipariş takibi</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 12 }}>Başka cihazdan mı bakıyorsun? Sipariş kodu ve telefonunla sorgula.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="search" style={{ flex: 1, minWidth: 120 }} placeholder="Sipariş kodu (KM…)" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="search" style={{ flex: 1, minWidth: 120 }} placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code && phone && lookup()} />
      </div>
      {lookupErr && <div className="error" style={{ marginTop: 10 }}>{lookupErr}</div>}
      <button className="cta" style={{ marginTop: 12 }} disabled={busy || !code.trim() || !phone.trim()} onClick={lookup}>
        {busy ? 'Sorgulanıyor…' : 'Siparişi sorgula'}
      </button>
    </div>
  );

  if (!orders) return <div className="loading">Yükleniyor…</div>;

  if (orders.length === 0)
    return (
      <>
        <h1 className="h1">Siparişlerim</h1>
        {loginForm}
        {lookupForm}
        <div className="empty" style={{ paddingTop: 20 }}>
          <div className="big">📦</div>
          <h2 className="serif">Bu cihazda kayıtlı sipariş yok</h2>
          <div>İlk siparişini ver ya da yukarıdan kod + telefonla sorgula.</div>
          <p><Link href="/" className="back">← Alışverişe başla</Link></p>
        </div>
      </>
    );

  return (
    <>
      <h1 className="h1">Siparişlerim</h1>
      {loginForm}
      {lookupForm}
      {orders.map((o) => {
        const cls = o.status === 'DELIVERED' ? 'done' : o.status === 'CANCELLED' ? 'cancel' : '';
        return (
          <Link href={`/siparis/${o.id}`} key={o.id}>
            <div className="orow">
              <div style={{ fontSize: 26 }}>🧾</div>
              <div>
                <div style={{ fontWeight: 600 }}>{o.code}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {o.deliveryWindow ? `Teslimat: ${o.deliveryWindow}` : 'Kapıda ödeme'} · {tl(o.grandTotal)}
                </div>
              </div>
              <span className={`statusbadge ${cls}`} style={{ marginLeft: 'auto' }}>{LABEL[o.status] ?? o.status}</span>
            </div>
          </Link>
        );
      })}
      <p style={{ marginTop: 16 }}><Link href="/" className="back">← Alışverişe devam et</Link></p>
    </>
  );
}
