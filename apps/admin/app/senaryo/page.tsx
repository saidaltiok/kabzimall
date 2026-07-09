'use client';

import { useState } from 'react';
import { apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';
import { ProductPicker } from '@/components/pickers';
import { tlToKurus } from '@/lib/money';

interface CostInputs { halAvg: number; fireRate: number; labor: number; packaging: number; fuel: number; coldStorage?: number; amortization?: number; commissionRate: number }
interface Side { directCost: number; netMargin: number; suggestedPrice: number; inputs: CostInputs }
interface ScenarioResult {
  productId: string; basePrice: number; targetMargin: number;
  baseline: Side; scenario: Side;
  delta: { directCost: number; directCostPct: number | null; netMarginPts: number };
}

const kurusToTl = (k: number) => (k / 100).toFixed(2);

export default function SenaryoPage() {
  const [productId, setProductId] = useState('');
  const [basePriceTl, setBasePriceTl] = useState('');
  const [levers, setLevers] = useState({ firePct: '', halTl: '', laborTl: '', packagingTl: '', fuelTl: '', commissionPct: '' });
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillLevers(i: CostInputs, basePrice: number) {
    setLevers({
      firePct: String(Math.round(i.fireRate * 100)),
      halTl: kurusToTl(i.halAvg),
      laborTl: kurusToTl(i.labor),
      packagingTl: kurusToTl(i.packaging),
      fuelTl: kurusToTl(i.fuel),
      commissionPct: String(Math.round(i.commissionRate * 100)),
    });
    setBasePriceTl(kurusToTl(basePrice));
  }

  async function loadBaseline() {
    setBusy(true); setError(null); setResult(null); setLoaded(false);
    try {
      const r = await apiSend<ScenarioResult>('POST', '/intel/price/scenario', { productId: productId.trim() });
      fillLevers(r.baseline.inputs, r.basePrice);
      setResult(r);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recompute() {
    setBusy(true); setError(null);
    try {
      const overrides = {
        fireRate: levers.firePct === '' ? undefined : Math.round(parseFloat(levers.firePct)) / 100,
        halAvg: levers.halTl === '' ? undefined : tlToKurus(levers.halTl),
        labor: levers.laborTl === '' ? undefined : tlToKurus(levers.laborTl),
        packaging: levers.packagingTl === '' ? undefined : tlToKurus(levers.packagingTl),
        fuel: levers.fuelTl === '' ? undefined : tlToKurus(levers.fuelTl),
        commissionRate: levers.commissionPct === '' ? undefined : Math.round(parseFloat(levers.commissionPct)) / 100,
      };
      const r = await apiSend<ScenarioResult>('POST', '/intel/price/scenario', {
        productId: productId.trim(),
        basePrice: basePriceTl === '' ? undefined : tlToKurus(basePriceTl),
        overrides,
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const L = (k: keyof typeof levers) => (e: React.ChangeEvent<HTMLInputElement>) => setLevers((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <Topbar title="Senaryo Analizi" sub="What-if: girdileri değiştir, marjı gör" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Bir ürünün maliyet girdilerini değiştir (fire, hal, yakıt…) ve marjın/öneri fiyatının nasıl
          değiştiğini <b>anında</b> gör. Örn. <b>fire %10→%20</b> ya da <b>yakıt +%15</b> olursa ne olur?
          Tüm hesap tek kaynaktan (packages/pricing).
        </p>
        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">Ürün</div>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 240 }}>
              <label>Ürün</label>
              <ProductPicker value={productId} onChange={setProductId} placeholder="Ürün ara ve seç…" />
            </div>
            <button className="btn" onClick={loadBaseline} disabled={busy || !productId.trim()}>Girdileri yükle</button>
          </div>
        </div>

        {loaded && (
          <>
            <div className="card">
              <div className="ct">Senaryo girdileri (düzenle → Hesapla)</div>
              <div className="form-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="field"><label>Satış fiyatı (₺)</label><input value={basePriceTl} onChange={(e) => setBasePriceTl(e.target.value)} style={{ width: 90 }} /></div>
                <div className="field"><label>Fire (%)</label><input value={levers.firePct} onChange={L('firePct')} style={{ width: 70 }} /></div>
                <div className="field"><label>Hal (₺)</label><input value={levers.halTl} onChange={L('halTl')} style={{ width: 80 }} /></div>
                <div className="field"><label>İşçilik (₺)</label><input value={levers.laborTl} onChange={L('laborTl')} style={{ width: 80 }} /></div>
                <div className="field"><label>Ambalaj (₺)</label><input value={levers.packagingTl} onChange={L('packagingTl')} style={{ width: 80 }} /></div>
                <div className="field"><label>Yakıt (₺)</label><input value={levers.fuelTl} onChange={L('fuelTl')} style={{ width: 80 }} /></div>
                <div className="field"><label>Komisyon (%)</label><input value={levers.commissionPct} onChange={L('commissionPct')} style={{ width: 70 }} /></div>
                <button className="btn" onClick={recompute} disabled={busy}>Hesapla</button>
              </div>
            </div>

            {result && (
              <div className="card">
                <div className="ct">Karşılaştırma <span>hedef marj {pct(result.targetMargin)}</span></div>
                <table>
                  <thead><tr><th>Metrik</th><th className="num">Baz</th><th className="num">Senaryo</th><th className="num">Fark</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>Direkt maliyet</td>
                      <td className="num">{tl(result.baseline.directCost)}</td>
                      <td className="num savecell">{tl(result.scenario.directCost)}</td>
                      <td className="num">
                        <span className={`tagp ${result.delta.directCost > 0 ? 'zararina' : result.delta.directCost < 0 ? 'ok' : 'info'}`}>
                          {result.delta.directCost > 0 ? '+' : ''}{tl(result.delta.directCost)}{result.delta.directCostPct != null ? ` (%${Math.round(result.delta.directCostPct * 100)})` : ''}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Net marj (satış {tl(result.basePrice)})</td>
                      <td className="num">{pct(result.baseline.netMargin)}</td>
                      <td className="num savecell">{pct(result.scenario.netMargin)}</td>
                      <td className="num">
                        <span className={`tagp ${result.delta.netMarginPts < 0 ? 'zararina' : result.delta.netMarginPts > 0 ? 'ok' : 'info'}`}>
                          {result.delta.netMarginPts > 0 ? '+' : ''}{(result.delta.netMarginPts * 100).toFixed(1)} puan
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Öneri fiyatı (hedef marj)</td>
                      <td className="num">{tl(result.baseline.suggestedPrice)}</td>
                      <td className="num savecell">{tl(result.scenario.suggestedPrice)}</td>
                      <td className="num">{result.scenario.suggestedPrice > result.baseline.suggestedPrice ? '↑' : result.scenario.suggestedPrice < result.baseline.suggestedPrice ? '↓' : '='}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="note2">Net marj negatifse ürün zararına; hedef marja ulaşmak için öneri fiyatı sütununu kullan.</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
