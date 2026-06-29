'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface SuggestResult {
  price: number;
  netMargin: number;
  competitionIndex: number | null;
  directCost: number;
  floored: boolean;
  belowCost: boolean;
  strategy: string;
  inputs: { halAvg: number; costSource: string; directCost: number; competitorCount: number; competitorAvg: number | null };
}

const CHIPS = [
  { id: 'domates', e: '🍅', name: 'Domates' },
  { id: 'patates', e: '🥔', name: 'Patates' },
  { id: 'biber', e: '🫑', name: 'Biber' },
  { id: 'salatalik', e: '🥒', name: 'Salatalık' },
];
const STRATS: [string, string][] = [
  ['MARGIN', 'Maliyet + hedef marj'],
  ['COMP_AVG', 'Rakip ortalaması'],
  ['COMP_AVG_MINUS', 'Ortalama − %3'],
  ['MEDIAN', 'Medyan'],
  ['LOWEST', 'En düşük rakip'],
  ['FLOOR', 'Min net kârı koru'],
];

export default function OnerPage() {
  const [productId, setProductId] = useState('domates');
  const [strategy, setStrategy] = useState('MARGIN');
  const [target, setTarget] = useState('0.30');
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    setApplied(null);
    setResult(null);
    try {
      const params: Record<string, number> = {};
      if (strategy === 'MARGIN' && target) params.targetMargin = Number(target);
      const r = await apiSend<SuggestResult>('POST', '/intel/price/suggest-product', { productId, strategy, params });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [productId, strategy, target]);

  // Ürün veya strateji değişince otomatik öner (prototipteki anlık his).
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, strategy]);

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
      setApplied(`✓ ${productId} mağaza fiyatı ${tl(result.price)} olarak yayınlandı.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Fiyat Öneri Motoru" sub="Öneri → tek tıkla mağazaya yaz" />
      <div className="body">
        <div className="pchips">
          {CHIPS.map((c) => (
            <div key={c.id} className={`pchip${productId === c.id ? ' sel' : ''}`} onClick={() => setProductId(c.id)}>
              <span className="e">{c.e}</span>
              {c.name}
            </div>
          ))}
        </div>
        <p className="hint">
          Maliyet (cost-components + günlük hal ort.) ve rakipler veritabanından toplanır; strateji
          uygulanır (komisyon + hedef marj dâhil, psikolojik yuvarlama + taban marj kuralı). Başka ürün
          için aşağıya slug yaz.
        </p>

        <div className="calcgrid">
          <div className="card">
            <div className="ct">Girdiler — {productId || '—'}</div>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="field">
                <label>Ürün (slug)</label>
                <input
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                  placeholder="domates"
                />
              </div>
              <div className="field">
                <label>Hedef marj (0–1)</label>
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                  disabled={strategy !== 'MARGIN'}
                />
              </div>
            </div>
            {result && (
              <>
                <div className="frow"><span className="lab">Hal (günlük ort.)</span><b>{tl(result.inputs.halAvg)}</b></div>
                <div className="frow"><span className="lab">Doğrudan maliyet</span><b>{tl(result.directCost)}</b></div>
                <div className="frow"><span className="lab">Rakip ortalaması ({result.inputs.competitorCount})</span><b>{tl(result.inputs.competitorAvg)}</b></div>
                <div className="frow"><span className="lab">Maliyet kaynağı</span><b>{result.inputs.costSource}</b></div>
              </>
            )}
          </div>

          <div>
            <div className="strat">
              {STRATS.map(([val, label]) => (
                <button key={val} className={strategy === val ? 'sel' : ''} onClick={() => setStrategy(val)} disabled={busy}>
                  {label}
                </button>
              ))}
            </div>

            {error && <div className="error">{error}</div>}
            {applied && <div className="ok-box">{applied}</div>}

            {result && (
              <div className={`result${result.floored || result.belowCost ? ' warn' : ''}`}>
                <div className="l">Önerilen satış fiyatı</div>
                <div className="big">{tl(result.price)}</div>
                <div className="miniinfo">
                  <span>Net marj <b>{pct(result.netMargin)}</b></span>
                  <span>
                    Rekabet endeksi <b>{result.competitionIndex ?? '—'}</b>
                    {result.competitionIndex != null && (result.competitionIndex < 100 ? ' (ucuz)' : ' (pahalı)')}
                  </span>
                  <span>Maliyet <b>{tl(result.directCost)}</b></span>
                </div>
                <div className="note2">
                  {result.belowCost
                    ? '⚠️ Bu fiyat maliyetin altında (fırsat ürünü olabilir).'
                    : result.floored
                      ? '⚠️ Taban marj devreye girdi: öneri min net kârın altına düşmeyecek şekilde yükseltildi.'
                      : 'Hesap: maliyet ÷ (1 − marj − komisyon) → psikolojik yuvarlama.'}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className="applybtn" onClick={apply} disabled={busy}>
                    ✓ Bu fiyatı mağazaya yaz
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
