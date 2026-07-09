'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { COST_TABS } from '@/components/SectionTabs';
import Icon from '@/components/Icon';
import { ProductPicker } from '@/components/pickers';
import { tlToKurus } from '@/lib/money';

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

// kuruş → TL string, TL string → kuruş
const k2tl = (k: number) => (k / 100).toFixed(2);
const tl2k = (s: string) => tlToKurus(s) ?? 0;
const p2r = (s: string) => Number(s.replace(',', '.')) / 100; // yüzde → oran

export default function MaliyetPage() {
  const [productId, setProductId] = useState('');
  const [halAvg, setHalAvg] = useState<number | null>(null);
  const [form, setForm] = useState<Form>({ fire: '15', labor: '1.20', pack: '0.70', fuel: '0.50', cold: '0', amort: '0', comm: '3' });
  const [serverCost, setServerCost] = useState<CostResult | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [floorPrice, setFloorPrice] = useState<number | null>(null); // komisyon DAHİL taban satış fiyatı
  const [scenario, setScenario] = useState<{ fire: number; directCost: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<string[]>([]); // toplu uygulama hedefleri
  const [bulkGlobal, setBulkGlobal] = useState(false);
  const [bulkNames, setBulkNames] = useState<Record<string, string>>({});

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

  useEffect(() => { if (productId) load(productId); }, [productId, load]);
  useEffect(() => {
    apiGet<{ data: { slug: string; name: string }[] }>('/catalog/products').then((r) => {
      const m: Record<string, string> = {}; for (const p of r.data) m[p.slug] = p.name; setBulkNames(m);
    }).catch(() => {});
  }, []);

  function costInput(fireOverride?: number) {
    return {
      halAvg: halAvg ?? 0,
      fireRate: fireOverride != null ? fireOverride / 100 : p2r(form.fire),
      labor: tl2k(form.labor), packaging: tl2k(form.pack), fuel: tl2k(form.fuel),
      coldStorage: tl2k(form.cold), amortization: tl2k(form.amort),
      commissionRate: 0, // komisyon artık genel gider (Finans) — birim maliyete girmez
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

  const componentsPayload = () => ({
    fireRate: p2r(form.fire), labor: tl2k(form.labor), packaging: tl2k(form.pack),
    fuel: tl2k(form.fuel), coldStorage: tl2k(form.cold), amortization: tl2k(form.amort),
    commissionRate: 0, // komisyon Finans → Genel Giderler'de; birim maliyette tutulmaz
  });

  async function save() {
    setBusy(true); setError(null); setSaved(null);
    try {
      await apiSend('PUT', '/intel/cost-components', { scope: 'PRODUCT', refId: productId, ...componentsPayload() });
      setSaved('Maliyet bileşenleri bu ürün için kaydedildi.');
      await load(productId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Aynı girdileri seçilen tüm ürünlere (ya da GLOBAL varsayılana) uygula. */
  async function saveBulk() {
    setBusy(true); setError(null); setSaved(null);
    try {
      const payload = componentsPayload();
      if (bulkGlobal) {
        await apiSend('PUT', '/intel/cost-components', { scope: 'GLOBAL', ...payload });
      }
      let done = 0;
      for (const slug of bulkTargets) {
        try { await apiSend('PUT', '/intel/cost-components', { scope: 'PRODUCT', refId: slug, ...payload }); done++; } catch { /* tekil hata toplu akışı bozmasın */ }
      }
      setSaved(`Girdiler ${bulkGlobal ? 'GLOBAL varsayılana' : ''}${bulkGlobal && done ? ' + ' : ''}${done ? `${done} ürüne` : ''} uygulandı.`);
      setBulkTargets([]); setBulkGlobal(false);
      if (productId) await load(productId);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const fireEffect = ((1 / (1 - p2r(form.fire)) - 1) * 100).toFixed(1);
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((s) => ({ ...s, [key]: e.target.value }));

  return (
    <>
      <Topbar title="Maliyet & Fire Motoru" sub="Gerçek birim maliyet hesabı" />
      <div className="body">
        <SectionTabs tabs={COST_TABS} />
        <div className="card" style={{ maxWidth: 360, marginBottom: 12 }}>
          <div className="field"><label>Ürün</label>
            <ProductPicker value={productId} onChange={setProductId} placeholder="Ürün ara ve seç…" />
          </div>
        </div>
        <p className="hint">
          Fire maliyete <b>toplanmaz, bölünür</b> — %20 fire maliyeti %25 artırır. Ürünü seçin, girdileri
          düzenleyin, <b>Hesapla</b> ile motordan gerçek birim maliyeti görün, beğenince <b>Kaydet</b>.
          (Maliyet için ürünün güncel hal alış verisi gerekir.)
        </p>
        {!productId && <p className="muted" style={{ fontSize: 13 }}>Başlamak için yukarıdan bir ürün seçin.</p>}

        {error && <div className="error">{error}</div>}
        {saved && <div className="ok-box">{saved}</div>}

        <div className="calcgrid">
          <div className="card">
            <div className="ct">Girdiler</div>
            <div className="frow"><span className="lab">Hal alış (günlük ort.)</span><b>{tl(halAvg)}</b></div>
            <Row label="Fire oranı (%)" value={form.fire} onChange={set('fire')} />
            <Row label="İşçilik / birim (₺)" value={form.labor} onChange={set('labor')} />
            <Row label="Ambalaj / poşet (₺)" value={form.pack} onChange={set('pack')} />
            <Row label="Yakıt / dağıtım (₺)" value={form.fuel} onChange={set('fuel')} />
            <Row label="Soğuk zincir (₺)" value={form.cold} onChange={set('cold')} />
            <Row label="Amortisman (₺)" value={form.amort} onChange={set('amort')} />
            <p className="note2" style={{ margin: '2px 0 0', fontSize: 11, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Icon name="info" size={15} style={{ flex: 'none', marginTop: 1 }} /> <span>Kart komisyonu birim maliyete girmez — <b>Finans → Genel Giderler</b>&apos;de (ciroya oranlı) tutulur;
              böylece nakit müşteri komisyonla fazla fiyatlanmaz.</span>
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn ghost" onClick={compute} disabled={busy}>Hesapla</button>
              <button className="btn" onClick={save} disabled={busy || !productId}>Bu ürüne kaydet</button>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 12 }}>
              <div className="ct" style={{ marginBottom: 6 }}>Toplu uygula</div>
              <p className="note2" style={{ marginTop: 0 }}>Yukarıdaki girdileri birden çok ürüne (ya da tüm ürünlere varsayılan olarak) tek seferde uygula. Fire/işçilik gibi kalemler çoğu üründe aynıdır.</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={bulkGlobal} onChange={(e) => setBulkGlobal(e.target.checked)} />
                Tüm ürünlere <b>varsayılan (GLOBAL)</b> olarak uygula
              </label>
              <div className="field" style={{ minWidth: 220 }}>
                <label>Belirli ürünlere uygula (birden çok)</label>
                <ProductPicker value="" onChange={(slug) => { if (slug && !bulkTargets.includes(slug)) setBulkTargets((t) => [...t, slug]); }} placeholder="Ürün ekle…" />
              </div>
              {bulkTargets.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                  {bulkTargets.map((s) => (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 20, padding: '4px 6px 4px 12px', fontSize: 12.5, background: '#fff' }}>
                      {bulkNames[s] ?? s}
                      <button onClick={() => setBulkTargets((t) => t.filter((x) => x !== s))} style={{ border: 'none', background: 'var(--cream, #f0ede6)', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <button className="btn" style={{ background: 'var(--persimmon)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={saveBulk} disabled={busy || (!bulkGlobal && bulkTargets.length === 0)}>
                <Icon name="download" size={15} /> Toplu uygula{bulkTargets.length > 0 ? ` (${bulkTargets.length} ürün)` : ''}
              </button>
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
                <div className="l">Taban satış fiyatı (taban marj ile)</div>
                <div className="big">{tl(floorPrice)}</div>
                <div className="note2">Bu fiyatın altına motor inmez; komisyon burada değil, Finans&apos;taki genel giderdedir.</div>
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
