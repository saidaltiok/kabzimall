'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';
import Icon from '@/components/Icon';
import { ProductPicker } from '@/components/pickers';

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

const STRATS: [string, string][] = [
  ['MARGIN', 'Maliyet + hedef marj'],
  ['COMP_AVG', 'Rakip ortalaması'],
  ['MEDIAN', 'Medyan'],
  ['LOWEST', 'En düşük rakip'],
  ['FLOOR', 'Min net kârı koru'],
];
/** Rakip tabanlı stratejiler: "ayarlama %" (offset) uygulanabilir. */
const COMP_BASED = new Set(['COMP_AVG', 'MEDIAN', 'LOWEST']);

export default function OnerPage() {
  const [productId, setProductId] = useState('');
  const [strategy, setStrategy] = useState('MARGIN');
  const [target, setTarget] = useState('0.30');
  const [offset, setOffset] = useState(''); // rakip tabanlı stratejide ± % ayarlama (ör. -5, +9)
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
      // Rakip tabanlı stratejide ± % ayarlama (ör. -5 → ort. −%5, +9 → medyan +%9).
      if (COMP_BASED.has(strategy) && offset.trim() !== '') {
        const off = parseFloat(offset.replace(',', '.'));
        if (Number.isFinite(off)) params.offsetPct = off / 100;
      }
      const r = await apiSend<SuggestResult>('POST', '/intel/price/suggest-product', { productId, strategy, params });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [productId, strategy, target, offset]);

  // Ürünler tablosundan "Fiyatla →" ile gelince ürünü ön-seç (?p=slug).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('p');
    if (p) setProductId(p);
  }, []);

  // Ürün / strateji / ayarlama değişince otomatik öner (prototipteki anlık his).
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, strategy, offset]);

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
      setApplied(`Mağaza fiyatı ${tl(result.price)} olarak yayınlandı${result.floored ? '' : ''}. Varsa eski indirim kaldırıldı.`);
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
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Ürünü seçin; maliyet (hal alış + fire/işçilik) ve rakipler veritabanından toplanır, seçtiğiniz
          strateji uygulanır (komisyon + hedef marj, psikolojik yuvarlama + taban marj kuralı dâhil).
          <b> Rakip ortalaması / Medyan / En düşük</b> stratejilerinde <b>Ayarlama (%)</b> ile dinamik kural
          kurun: <b>−5</b> = seçili tabanın %5 altı, <b>+9</b> = %9 üstü. Öneriyi tek tıkla mağaza fiyatı yapabilirsiniz.
        </p>

        <div className="calcgrid">
          <div className="card">
            <div className="ct">Girdiler</div>
            <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ minWidth: 220 }}>
                <label>Ürün</label>
                <ProductPicker value={productId} onChange={setProductId} placeholder="Ürün ara ve seç…" />
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
              <div className="field">
                <label>Ayarlama (%) <span className="muted" style={{ fontWeight: 400 }}>eksi = ucuz</span></label>
                <input
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                  disabled={!COMP_BASED.has(strategy)}
                  placeholder="-5 / +9"
                  style={{ width: 90 }}
                  title="Rakip tabanlı stratejide seçilen tabana uygulanır: -5 → ort. %5 altı, +9 → %9 üstü"
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
                  {result.belowCost ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={15} /> Bu fiyat maliyetin altında (fırsat ürünü olabilir).</span>
                  ) : result.floored ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={15} /> Taban marj devreye girdi: öneri min net kârın altına düşmeyecek şekilde yükseltildi.</span>
                  ) : (
                    'Hesap: maliyet ÷ (1 − marj − komisyon) → psikolojik yuvarlama.'
                  )}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className="applybtn" onClick={apply} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="check" size={15} /> Bu fiyatı mağazaya yaz
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
