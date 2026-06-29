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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HalPage() {
  const [productId, setProductId] = useState('');
  const [priceTl, setPriceTl] = useState('');
  const [date, setDate] = useState(today());
  const [grid, setGrid] = useState<Grid | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGrid = useCallback(async (d: string) => {
    try {
      setGrid(await apiGet<Grid>(`/intel/hal?date=${d}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadGrid(date);
  }, [date, loadGrid]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const kurus = Math.round(parseFloat(priceTl.replace(',', '.')) * 100);
      if (!Number.isFinite(kurus) || kurus < 0) throw new Error('Geçerli bir fiyat girin (₺).');
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
                  <th className="num">Günlük ortalama</th>
                  <th className="num">Fiyatlar</th>
                </tr>
              </thead>
              <tbody>
                {grid.data.map((r) => (
                  <tr key={r.productId}>
                    <td>{r.productId}</td>
                    <td className="num">{r.count}</td>
                    <td className="num savecell"><b>{tl(r.dailyAverage)}</b></td>
                    <td className="num">{r.entries.map((e) => tl(e.price)).join(' · ')}</td>
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
