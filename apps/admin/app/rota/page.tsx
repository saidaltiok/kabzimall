'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiGet } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import type { RouteStop } from '@/components/RouteMap';

const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

interface Stop extends RouteStop {
  orderId: string;
  customerPhone: string;
  addressText: string;
  deliveryWindow: string | null;
  grandTotal: number;
  legKm: number;
}
interface NoGeo { id: string; code: string; customerName: string; addressText: string }
interface RouteResp {
  date: string | null;
  depot: { lat: number; lng: number };
  stops: number;
  distanceKm: number;
  estMinutes: number;
  route: Stop[];
  noGeo: NoGeo[];
  googleMapsUrl: string;
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function RotaPage() {
  const [date, setDate] = useState(tomorrow());
  const [data, setData] = useState<RouteResp | null>(null);
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

  return (
    <>
      <Topbar title="Dağıtım Rotası" sub="Günlük teslimat için optimize sıralama" />
      <div className="body">
        <p className="hint">
          Seçili teslimat gününün, haritada konumu olan siparişlerini depodan başlayıp <b>en kısa turla</b> sıralar
          (nearest-neighbor + 2-opt). Kuryeye <b>Google Maps çoklu durak</b> yol tarifi tek tıkla açılır.
        </p>

        <div className="form-row" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
          <div className="field"><label>Teslimat günü</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <button className="btn ghost" onClick={() => load(date)} disabled={loading}>{loading ? 'Hesaplanıyor…' : 'Yenile'}</button>
          {data && data.stops > 0 && (
            <a className="btn" style={{ background: 'var(--persimmon)' }} href={data.googleMapsUrl} target="_blank" rel="noreferrer">🗺️ Google Maps’te aç (yol tarifi)</a>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        {data && (
          <>
            <div className="miniinfo" style={{ marginBottom: 12 }}>
              <span>Durak <b>{data.stops}</b></span>
              <span>Toplam mesafe <b>{data.distanceKm} km</b></span>
              <span>Tahmini süre <b>~{data.estMinutes} dk</b></span>
              {data.noGeo.length > 0 && <span>Konumsuz <b style={{ color: 'var(--persimmon)' }}>{data.noGeo.length}</b></span>}
            </div>

            {data.stops === 0 ? (
              <div className="card"><p className="muted">Bu gün için haritada konumu olan sipariş yok.</p></div>
            ) : (
              <div className="layout2" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card">
                  <div className="ct">Ziyaret sırası</div>
                  <table>
                    <thead><tr><th>#</th><th>Müşteri</th><th>Saat</th><th className="num">Bacak</th><th className="num">Tutar</th></tr></thead>
                    <tbody>
                      {data.route.map((s) => (
                        <tr key={s.orderId}>
                          <td><span className="tagp ok">{s.seq}</span></td>
                          <td>{s.customerName}<div className="muted" style={{ fontSize: 11 }}>{s.code} · {s.addressText}</div></td>
                          <td className="muted" style={{ fontSize: 11 }}>{s.deliveryWindow ?? '—'}</td>
                          <td className="num muted">{s.legKm} km</td>
                          <td className="num savecell">{tl(s.grandTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card">
                  <div className="ct">Harita</div>
                  <RouteMap depot={data.depot} stops={data.route} />
                </div>
              </div>
            )}

            {data.noGeo.length > 0 && (
              <div className="card" style={{ marginTop: 12, borderLeft: '3px solid var(--persimmon)' }}>
                <div className="ct">Konumsuz siparişler <span>{data.noGeo.length}</span></div>
                <p className="muted" style={{ fontSize: 12 }}>Bu siparişlerde harita konumu yok; rotaya giremediler. Adresten manuel planlayın.</p>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                  {data.noGeo.map((o) => <li key={o.id}><b>{o.code}</b> · {o.customerName} · {o.addressText}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
