'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';

interface Row {
  slug: string;
  name: string;
  coverage: number;
  minComp: number;
  medianComp: number;
  ourPrice: number | null;
  isActive: boolean;
  directCost: number | null;
  floorPrice: number | null;
  belowFloor: boolean;
}
interface Coverage {
  totalCompetitors: number;
  rows: Row[];
}

export default function YayinlaPage() {
  const [data, setData] = useState<Coverage | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [basis, setBasis] = useState<'median' | 'min'>('median');
  const [minCov, setMinCov] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiGet<Coverage>('/intel/competitor-prices/coverage'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const maxCov = useMemo(() => rows.reduce((m, r) => Math.max(m, r.coverage), 0), [rows]);

  function toggle(slug: string) {
    setSel((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }
  function selectIntersection() {
    setSel(new Set(rows.filter((r) => r.coverage >= minCov).map((r) => r.slug)));
  }
  function clearSel() { setSel(new Set()); }

  /** Backend'deki güvenlik mantığıyla aynı: maliyet varsa fiyat taban marjın altına inmez. */
  function priceFor(r: Row): number {
    const raw = basis === 'min' ? r.minComp : r.medianComp;
    const competitorPrice = Math.max(50, Math.round(raw / 50) * 50);
    if (r.floorPrice != null && competitorPrice < r.floorPrice) {
      return Math.max(50, Math.ceil(r.floorPrice / 50) * 50); // yukarı — tabanın altına inilmez
    }
    return competitorPrice;
  }
  function isFloored(r: Row): boolean {
    const raw = basis === 'min' ? r.minComp : r.medianComp;
    return r.floorPrice != null && raw < r.floorPrice;
  }

  async function publish() {
    const slugs = [...sel];
    if (slugs.length === 0) { setError('Önce ürün seç.'); return; }
    if (!confirm(`${slugs.length} ürün yayına alınacak; başlangıç satış fiyatı rakip ${basis === 'min' ? 'en düşüğü' : 'medyanı'} olarak atanacak. Devam?`)) return;
    setBusy(true); setError(null); setOk(null);
    try {
      const r = await apiSend<{ published: number; flooredCount: number }>('POST', '/intel/competitor-prices/publish', { slugs, basis });
      const flooredNote = r.flooredCount > 0 ? ` (${r.flooredCount} tanesi maliyet altına düşmesin diye taban fiyata yükseltildi)` : '';
      setOk(`✓ ${r.published} ürün yayına alındı (fiyatlandı + aktifleştirildi)${flooredNote}.`);
      setSel(new Set());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const intersectionCount = rows.filter((r) => r.coverage >= minCov).length;

  return (
    <>
      <Topbar title="Yayına Al" sub="Rakip kapsamına göre en çok tercih edilen ürünleri yayına al" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          <b>Kesişim kümesi</b> = en çok rakipte bulunan ürünler (herkesin sattığı = en çok tercih edilenler).
          Eşiği seç, <b>Kesişimi seç</b> ile işaretle, başlangıç fiyatı için rakip <b>medyan/min</b> tabanını belirle,
          <b>Yayına al</b>. Ürünler aktifleşir ve web mağazasında görünür.
          <b> Maliyet altına asla düşülmez</b> — rakip fiyatı maliyetin altındaysa (⚠️ taban) otomatik taban marja yükseltilir.
        </p>

        <div className="form-row" style={{ marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>En az kaç rakipte bulunsun</label>
            <select value={minCov} onChange={(e) => setMinCov(Number(e.target.value))}>
              {Array.from({ length: Math.max(1, maxCov) }, (_, i) => i + 1).reverse().map((n) => (
                <option key={n} value={n}>{n}+ rakip{n === maxCov ? ' (tam kesişim)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Başlangıç fiyatı tabanı</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as 'median' | 'min')}>
              <option value="median">Rakip medyanı</option>
              <option value="min">Rakip en düşüğü (agresif)</option>
            </select>
          </div>
          <button className="btn ghost" onClick={selectIntersection}>Kesişimi seç ({intersectionCount})</button>
          <button className="btn ghost" onClick={clearSel} disabled={sel.size === 0}>Temizle</button>
          <button className="btn" style={{ background: 'var(--persimmon)' }} onClick={publish} disabled={busy || sel.size === 0}>
            {busy ? 'Yayınlanıyor…' : `🚀 Seçilenleri yayına al (${sel.size})`}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">
            Rakip kapsam sıralaması <span>{rows.length} üründe veri · {data?.totalCompetitors ?? 0} aktif rakip</span>
          </div>
          {rows.length === 0 ? (
            <p className="muted">Henüz rakip fiyatı yok. Önce Rakip Fiyatları → “Tüm katalog için toplu çek”.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th>Ürün</th>
                  <th className="num">Kapsam</th>
                  <th className="num">Rakip medyan</th>
                  <th className="num">Rakip min</th>
                  <th className="num">Maliyet</th>
                  <th className="num">Yeni fiyat</th>
                  <th className="num">Bizim</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const floored = isFloored(r);
                  return (
                    <tr key={r.slug} style={sel.has(r.slug) ? { background: 'var(--wash, #f3f7f4)' } : undefined}>
                      <td><input type="checkbox" checked={sel.has(r.slug)} onChange={() => toggle(r.slug)} /></td>
                      <td>{r.name} <span className="muted" style={{ fontSize: 11 }}>{r.slug}</span></td>
                      <td className="num">
                        <span className={`tagp ${r.coverage >= minCov ? 'ok' : 'info'}`}>{r.coverage}/{data?.totalCompetitors ?? '?'}</span>
                      </td>
                      <td className="num">{tl(r.medianComp)}</td>
                      <td className="num muted">{tl(r.minComp)}</td>
                      <td className="num muted">
                        {r.directCost != null ? tl(r.directCost) : <span title="Maliyet/hal verisi yok — güvenlik kontrolü yapılamıyor">?</span>}
                      </td>
                      <td className="num savecell">
                        {tl(priceFor(r))}
                        {floored && <span className="tagp zararina" style={{ marginLeft: 6, fontSize: 10 }} title={`Rakip fiyatı maliyetin altındaydı, taban fiyata (${r.floorPrice != null ? tl(r.floorPrice) : '?'}) yükseltildi`}>⚠️ taban</span>}
                      </td>
                      <td className="num muted">{r.ourPrice != null ? tl(r.ourPrice) : '—'}</td>
                      <td>{r.isActive ? <span className="tagp ok">yayında</span> : <span className="tagp info">pasif</span>}</td>
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
