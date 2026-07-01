'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface GridRow {
  productId: string;
  count: number;
  dailyAverage: number;
  entries: { id: string; price: number; source: string | null }[];
}
interface Grid {
  date: string;
  data: GridRow[];
}
interface Prev {
  date: string;
  data: { productId: string; price: number; date: string }[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Aykırı değer eşiği: önceki fiyata göre %40+ sapma "emin misin?" tetikler. */
const OUTLIER_PCT = 0.4;

export default function HalPage() {
  const [productId, setProductId] = useState('');
  const [priceTl, setPriceTl] = useState('');
  const [date, setDate] = useState(today());
  const [grid, setGrid] = useState<Grid | null>(null);
  const [prev, setPrev] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGrid = useCallback(async (d: string) => {
    try {
      const [g, p] = await Promise.all([
        apiGet<Grid>(`/intel/hal?date=${d}`),
        apiGet<Prev>(`/intel/hal/previous?date=${d}`),
      ]);
      setGrid(g);
      setPrev(Object.fromEntries(p.data.map((r) => [r.productId, r.price])));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadGrid(date);
  }, [date, loadGrid]);

  const prevPrice = productId.trim() ? prev[productId.trim()] ?? null : null;
  const typedKurus = priceTl.trim() === '' ? null : Math.round(parseFloat(priceTl.replace(',', '.')) * 100);
  const deviation = prevPrice != null && typedKurus != null && prevPrice > 0 ? (typedKurus - prevPrice) / prevPrice : null;
  const isOutlier = deviation != null && Math.abs(deviation) >= OUTLIER_PCT;

  async function add() {
    const kurus = typedKurus;
    if (kurus == null || !Number.isFinite(kurus) || kurus < 0) { setError('Geçerli bir fiyat girin (₺).'); return; }
    // Aykırı değerde onay iste (Saha Modu veri kalitesi güvencesi).
    if (isOutlier && prevPrice != null) {
      const pct = Math.round((deviation as number) * 100);
      if (!confirm(`Dün ${(prevPrice / 100).toFixed(2)} ₺ idi, bugün ${(kurus / 100).toFixed(2)} ₺ (%${pct > 0 ? '+' : ''}${pct}). Emin misin?`)) return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/intel/hal/entries', { productId, price: kurus, date, source: 'MANUAL' });
      setPriceTl('');
      await loadGrid(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Hal Fiyatları" sub="Günlük hal fiyat girişi (append-only)" />
      <div className="body">
        <p className="hint">
          Hal fiyatı günde bir kez yayımlanır; her giriş yeni satırdır (geçmiş korunur) ve{' '}
          <b>günlük ortalama otomatik hesaplanır</b>. Bu ortalama maliyet → öneri zincirini besler.
        </p>

        <div className="card">
          <div className="ct">Yeni giriş</div>
          <div className="form-row">
            <div className="field">
              <label>Ürün (slug)</label>
              <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="domates" />
            </div>
            <div className="field">
              <label>Fiyat (₺/birim)</label>
              <input value={priceTl} onChange={(e) => setPriceTl(e.target.value)} placeholder="18,70" onKeyDown={(e) => e.key === 'Enter' && productId && priceTl && add()} />
            </div>
            <div className="field">
              <label>Tarih</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button className="btn" onClick={add} disabled={busy || !productId || !priceTl}>
              {busy ? '…' : 'Ekle'}
            </button>
          </div>
          {prevPrice != null && (
            <p className="note2" style={{ marginTop: 8 }}>
              Önceki fiyat: <b>{tl(prevPrice)}</b>{' '}
              <button className="btn ghost" style={{ padding: '3px 9px', fontSize: 11, marginLeft: 6 }} onClick={() => setPriceTl((prevPrice / 100).toFixed(2))}>Dünden kopyala</button>
              {isOutlier && (
                <span style={{ color: 'var(--berry)', fontWeight: 700, marginLeft: 10 }}>
                  ⚠️ %{Math.round((deviation as number) * 100) > 0 ? '+' : ''}{Math.round((deviation as number) * 100)} sapma — emin misin?
                </span>
              )}
            </p>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">
            Günlük ızgara <span>{grid?.date ?? date}</span>
          </div>
          {!grid ? (
            <p className="muted">Yükleniyor…</p>
          ) : grid.data.length === 0 ? (
            <p className="muted">Bu güne ait hal girişi yok.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="num">Giriş</th>
                  <th className="num">Dün</th>
                  <th className="num">Günlük ortalama</th>
                  <th className="num">Değişim</th>
                  <th className="num">Fiyatlar</th>
                </tr>
              </thead>
              <tbody>
                {grid.data.map((r) => {
                  const p = prev[r.productId] ?? null;
                  const chg = p != null && p > 0 ? (r.dailyAverage - p) / p : null;
                  const big = chg != null && Math.abs(chg) >= OUTLIER_PCT;
                  return (
                    <tr key={r.productId}>
                      <td>{r.productId}</td>
                      <td className="num">{r.count}</td>
                      <td className="num muted">{p != null ? tl(p) : '—'}</td>
                      <td className="num savecell"><b>{tl(r.dailyAverage)}</b></td>
                      <td className="num">
                        {chg == null ? '—' : (
                          <span className={`tagp ${big ? 'zararina' : 'info'}`}>%{Math.round(chg * 100) > 0 ? '+' : ''}{Math.round(chg * 100)}</span>
                        )}
                      </td>
                      <td className="num">{r.entries.map((e) => tl(e.price)).join(' · ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
