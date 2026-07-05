'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { COST_TABS } from '@/components/SectionTabs';

interface CostResult {
  source: string;
  halAvg: number | null;
  directCost: number | null;
  components: {
    fireRate: number; packaging: number; labor: number; fuel: number;
    coldStorage: number; amortization: number; commissionRate: number;
  };
}
interface Form { fire: string; labor: string; pack: string; fuel: string; cold: string; amort: string; comm: string }

const CHIPS = [
  { id: 'domates', e: '🍅', name: 'Domates' },
  { id: 'patates', e: '🥔', name: 'Patates' },
  { id: 'biber', e: '🫑', name: 'Biber' },
  { id: 'salatalik', e: '🥒', name: 'Salatalık' },
];

// kuruş → TL string, TL string → kuruş
const k2tl = (k: number) => (k / 100).toFixed(2);
const tl2k = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100);
const p2r = (s: string) => Number(s.replace(',', '.')) / 100; // yüzde → oran

export default function MaliyetPage() {
  const [productId, setProductId] = useState('domates');
  const [halAvg, setHalAvg] = useState<number | null>(null);
  const [form, setForm] = useState<Form>({ fire: '15', labor: '1.20', pack: '0.70', fuel: '0.50', cold: '0', amort: '0', comm: '3' });
  const [serverCost, setServerCost] = useState<CostResult | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [floorPrice, setFloorPrice] = useState<number | null>(null); // komisyon DAHİL taban satış fiyatı
  const [scenario, setScenario] = useState<{ fire: number; directCost: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pid: string) => {
    setError(null); setSaved(null); setPreview(null); setFloorPrice(null); setScenario([]);
    try {
      const c = await apiGet<CostResult>(`/intel/cost/${encodeURIComponent(pid)}`);
      setServerCost(c);
      setHalAvg(c.halAvg);
      const m = c.components;
      setForm({
        fire: String(Math.round(m.fireRate * 100)),
        labor: k2tl(m.labor), pack: k2tl(m.packaging), fuel: k2tl(m.fuel),
        cold: k2tl(m.coldStorage), amort: k2tl(m.amortization),
        comm: String(Math.round(m.commissionRate * 100)),
      });
    } catch (e) {
      // maliyet tanımsız (404) ya da hal yok — formu sıfır bırak
      setServerCost(null);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(productId); }, [productId, load]);

  function costInput(fireOverride?: number) {
    return {
      halAvg: halAvg ?? 0,
      fireRate: fireOverride != null ? fireOverride / 100 : p2r(form.fire),
      labor: tl2k(form.labor), packaging: tl2k(form.pack), fuel: tl2k(form.fuel),
      coldStorage: tl2k(form.cold), amortization: tl2k(form.amort),
      commissionRate: p2r(form.comm),
    };
  }

  // Önizleme + senaryo: hesap motordan (POST /price/suggest, FLOOR) — tek kaynak korunur.
  async function compute() {
    if (halAvg == null) { setError('Bu ürün için hal fiyatı yok; önce Hal Girişi yap.'); return; }
    setBusy(true); setError(null); setSaved(null);
    try {
      const fires = [10, Number(form.fire), 20, 30].filter((v, i, a) => a.indexOf(v) === i);
      const calls = [costInput(), ...fires.map((f) => costInput(f))];
      const results = await Promise.all(
        calls.map((cost) => apiSend<{ directCost: number; price: number }>('POST', '/intel/price/suggest', { cost, strategy: 'FLOOR' })),
      );
      setPreview(results[0].directCost);
      setFloorPrice(results[0].price); // taban marj + komisyon dahil satış fiyatı
      setScenario(fires.map((f, i) => ({ fire: f, directCost: results[i + 1].directCost })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true); setError(null); setSaved(null);
    try {
      await apiSend('PUT', '/intel/cost-components', {
        scope: 'PRODUCT', refId: productId,
        fireRate: p2r(form.fire), labor: tl2k(form.labor), packaging: tl2k(form.pack),
        fuel: tl2k(form.fuel), coldStorage: tl2k(form.cold), amortization: tl2k(form.amort),
        commissionRate: p2r(form.comm),
      });
      setSaved(`✓ ${productId} maliyet bileşenleri kaydedildi (PRODUCT kapsamı).`);
      await load(productId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fireEffect = ((1 / (1 - p2r(form.fire)) - 1) * 100).toFixed(1);
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((s) => ({ ...s, [key]: e.target.value }));

  return (
    <>
      <Topbar title="Maliyet & Fire Motoru" sub="Gerçek birim maliyet hesabı" />
      <div className="body">
        <SectionTabs tabs={COST_TABS} />
        <div className="pchips">
          {CHIPS.map((c) => (
            <div key={c.id} className={`pchip${productId === c.id ? ' sel' : ''}`} onClick={() => setProductId(c.id)}>
              <span className="e">{c.e}</span>{c.name}
            </div>
          ))}
        </div>
        <p className="hint">
          Fire maliyete <b>toplanmaz, bölünür</b> — %20 fire maliyeti %25 artırır. Girdileri düzenle,
          <b> Hesapla</b> ile motordan gerçek birim maliyeti gör, beğenince <b>Kaydet</b>. (Slug için chip yoksa
          başka ürün de seçilebilir; hal verisi gerekir.)
        </p>

        {error && <div className="error">{error}</div>}
        {saved && <div className="ok-box">{saved}</div>}

        <div className="calcgrid">
          <div className="card">
            <div className="ct">Girdiler — {productId}</div>
            <div className="frow"><span className="lab">Hal alış (günlük ort.)</span><b>{tl(halAvg)}</b></div>
            <Row label="Fire oranı (%)" value={form.fire} onChange={set('fire')} />
            <Row label="İşçilik / birim (₺)" value={form.labor} onChange={set('labor')} />
            <Row label="Ambalaj / poşet (₺)" value={form.pack} onChange={set('pack')} />
            <Row label="Yakıt / dağıtım (₺)" value={form.fuel} onChange={set('fuel')} />
            <Row label="Soğuk zincir (₺)" value={form.cold} onChange={set('cold')} />
            <Row label="Amortisman (₺)" value={form.amort} onChange={set('amort')} />
            <Row label="Kart komisyonu (%)" value={form.comm} onChange={set('comm')} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn ghost" onClick={compute} disabled={busy}>Hesapla</button>
              <button className="btn" onClick={save} disabled={busy}>Kaydet</button>
            </div>
          </div>

          <div>
            <div className={`result${preview != null && serverCost?.halAvg != null ? '' : ' warn'}`}>
              <div className="l">Gerçek birim maliyet (komisyon hariç)</div>
              <div className="big">{tl(preview ?? serverCost?.directCost ?? null)}</div>
              <div className="note2">
                Fire etkisi: %{form.fire} fire, maliyeti <b>+%{fireEffect}</b> artırıyor.
                {serverCost && <> · Kayıtlı kaynak: <b>{serverCost.source}</b></>}
              </div>
            </div>

            {floorPrice != null && (
              <div className="result" style={{ marginTop: 12 }}>
                <div className="l">Taban satış fiyatı (taban marj + %{form.comm} komisyon dahil)</div>
                <div className="big">{tl(floorPrice)}</div>
                <div className="note2">
                  Komisyon birim maliyete girmez; <b>satış fiyatını</b> etkiler. Kart komisyonunu değiştirip
                  <b> Hesapla</b>&apos;ya basınca bu değer değişir (maliyet sabit kalır).
                </div>
              </div>
            )}

            {scenario.length > 0 && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="ct">Fire senaryosu</div>
                <table>
                  <thead><tr><th>Senaryo</th><th className="num">Doğrudan maliyet</th></tr></thead>
                  <tbody>
                    {scenario.map((s) => (
                      <tr key={s.fire}>
                        <td>Fire %{s.fire}{s.fire === Number(form.fire) ? ' (mevcut)' : ''}</td>
                        <td className="num">{tl(s.directCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="frow">
      <span className="lab">{label}</span>
      <input className="cell" style={{ width: 90 }} value={value} onChange={onChange} />
    </div>
  );
}
