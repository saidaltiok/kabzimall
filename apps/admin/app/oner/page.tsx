'use client';

import { useState } from 'react';
import { apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';

interface SuggestResult {
  price: number;
  netMargin: number;
  competitionIndex: number | null;
  directCost: number;
  floored: boolean;
  belowCost: boolean;
  strategy: string;
  inputs: {
    halAvg: number;
    costSource: string;
    directCost: number;
    competitorCount: number;
    competitorAvg: number | null;
  };
}

const STRATEGIES = ['MARGIN', 'COMP_AVG', 'COMP_AVG_MINUS', 'MEDIAN', 'LOWEST', 'HAL_MARKUP', 'FLOOR'];

export default function OnerPage() {
  const [productId, setProductId] = useState('domates');
  const [strategy, setStrategy] = useState('MARGIN');
  const [targetMargin, setTargetMargin] = useState('0.30');
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    setApplied(null);
    setResult(null);
    try {
      const params: Record<string, number> = {};
      if (strategy === 'MARGIN' && targetMargin) params.targetMargin = Number(targetMargin);
      const r = await apiSend<SuggestResult>('POST', '/intel/price/suggest-product', {
        productId,
        strategy,
        params,
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/intel/price/apply', {
        productId,
        price: result.price,
        strategy: result.strategy,
        netMargin: result.netMargin,
        reason: 'Panelden uygulandı',
      });
      setApplied(`${productId} fiyatı ${tl(result.price)} olarak yayınlandı.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">Fiyat Öner</h1>
      <p className="page-sub">
        Ürün için maliyet (cost-components + günlük hal ort.) ve rakipler veritabanından
        toplanır; seçilen strateji uygulanır.
      </p>

      <div className="card">
        <div className="form-row">
          <div className="field">
            <label>Ürün (slug)</label>
            <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="domates" />
          </div>
          <div className="field">
            <label>Strateji</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {strategy === 'MARGIN' && (
            <div className="field">
              <label>Hedef marj (0–1)</label>
              <input value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} />
            </div>
          )}
          <button className="btn" onClick={suggest} disabled={busy || !productId}>
            {busy ? '…' : 'Öner'}
          </button>
        </div>
        <p className="hint">Örnek hazır ürünler: domates, patates, biber.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {applied && <div className="ok">{applied}</div>}

      {result && (
        <div className="card">
          <h2>Öneri — {result.strategy}</h2>
          <div className="price-hero">{tl(result.price)}</div>
          <div style={{ margin: '6px 0 16px' }}>
            {result.floored && <span className="badge dusuk">Taban marja yükseltildi</span>}
            {result.belowCost && <span className="badge zararina">Maliyetin altında</span>}
          </div>
          <div className="result">
            <Item l="Net marj" v={pct(result.netMargin)} />
            <Item l="Birim maliyet" v={tl(result.directCost)} />
            <Item l="Rekabet endeksi" v={result.competitionIndex != null ? String(result.competitionIndex) : '—'} />
            <Item l="Hal ortalaması" v={tl(result.inputs.halAvg)} />
            <Item l="Rakip sayısı" v={String(result.inputs.competitorCount)} />
            <Item l="Rakip ort." v={tl(result.inputs.competitorAvg)} />
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn accent" onClick={apply} disabled={busy}>
              Bu fiyatı uygula
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Item({ l, v }: { l: string; v: string }) {
  return (
    <div className="item">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
    </div>
  );
}
