'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';

interface Stop {
  seq: number;
  orderId: string;
  code: string;
  customerName: string;
  customerPhone: string;
  addressText: string;
  deliveryWindow: string | null;
  grandTotal: number;
  lat: number;
  lng: number;
  legKm: number;
}
interface RouteResp {
  depot: { lat: number; lng: number };
  stops: number;
  distanceKm: number;
  estMinutes: number;
  route: Stop[];
  googleMapsUrl: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const C = {
  bg: '#F6F1E7', forest: '#1F4D38', persimmon: '#E4572E', ink: '#26241f', muted: '#7c7667', line: '#e2ded4',
};

export default function KuryePage() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<RouteResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true); setError(null);
    try {
      setData(await apiGet<RouteResp>(`/admin/orders/route?date=${d}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(date); }, [date, load]);

  async function deliver(s: Stop) {
    if (!confirm(`${s.customerName} — teslim edildi olarak işaretlensin mi?`)) return;
    setBusy(s.orderId); setError(null);
    try {
      await apiSend('PATCH', `/admin/orders/${s.orderId}/status`, { status: 'DELIVERED' });
      await load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const btn: React.CSSProperties = { flex: 1, padding: '11px 8px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, background: C.forest, color: '#fff', padding: '14px 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>🚚 Kurye Rotası</div>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 13 }}
          />
        </div>
        {data && data.stops > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 13, opacity: 0.95, flexWrap: 'wrap' }}>
            <span><b>{data.stops}</b> durak</span>
            <span><b>{data.distanceKm}</b> km</span>
            <span>~<b>{data.estMinutes}</b> dk</span>
            <a href={data.googleMapsUrl} target="_blank" rel="noreferrer" style={{ color: '#fff', fontWeight: 700, marginLeft: 'auto' }}>🗺️ Tüm rota</a>
          </div>
        )}
      </header>

      <main style={{ padding: 14, maxWidth: 560, margin: '0 auto' }}>
        {error && <div style={{ background: '#fdecea', color: '#a3271b', padding: 10, borderRadius: 10, marginBottom: 12, fontSize: 14 }}>{error}</div>}
        {loading && <p style={{ color: C.muted }}>Yükleniyor…</p>}

        {data && data.stops === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: C.muted }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <p style={{ fontWeight: 600, marginTop: 8 }}>Bu gün için rota yok</p>
            <p style={{ fontSize: 13 }}>Konumlu, bekleyen teslimat bulunmuyor.</p>
          </div>
        )}

        {data?.route.map((s) => (
          <div key={s.orderId} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: C.forest, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{s.seq}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{s.customerName}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{s.addressText}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>#{s.code}</span>
                  {s.deliveryWindow && <span>🕒 {s.deliveryWindow}</span>}
                  <span>+{s.legKm} km</span>
                  <span style={{ color: C.forest, fontWeight: 700 }}>{tl(s.grandTotal)}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <a href={`tel:${s.customerPhone}`} style={btn}>📞 Ara</a>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" style={btn}>🧭 Yol tarifi</a>
              <button onClick={() => deliver(s)} disabled={busy === s.orderId} style={{ ...btn, background: C.forest, color: '#fff', border: 'none' }}>
                {busy === s.orderId ? '…' : '✅ Teslim'}
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
