'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface Product { slug: string; name: string; kind: string; unitLabel: string | null; isActive: boolean }
interface GridRow { productId: string; count: number; dailyAverage: number }
interface Grid { date: string; data: GridRow[] }
interface Prev { date: string; data: { productId: string; price: number }[] }
interface IbbRow { sourceName: string; unit: string | null; low: number; high: number; price: number; category: string; matchedSlug: string | null; matchedName: string | null }
interface IbbPreview { date: string; rows: IbbRow[]; unmatched: number }

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
const OUTLIER_PCT = 0.4;
const IBB_CATS: [string, string][] = [['', 'Hepsi'], ['6', 'Sebze'], ['5', 'Meyve'], ['7', 'İthal']];

export default function HalPage() {
  const [date, setDate] = useState(today());
  const [products, setProducts] = useState<Product[]>([]);
  const [prev, setPrev] = useState<Record<string, number>>({});
  const [grid, setGrid] = useState<Record<string, GridRow>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // ad-hoc tek ürün (katalogda olmayan)
  const [adhocSlug, setAdhocSlug] = useState('');
  const [adhocPrice, setAdhocPrice] = useState('');
  // İBB otomatik çekim
  const [ibbCat, setIbbCat] = useState('6');
  const [ibbSide, setIbbSide] = useState('avrupa');
  const [ibbRows, setIbbRows] = useState<IbbRow[] | null>(null);
  const [ibbSlugs, setIbbSlugs] = useState<Record<string, string>>({}); // sourceName → slug (düzenlenebilir)
  const [ibbBusy, setIbbBusy] = useState(false);

  const load = useCallback(async (d: string) => {
    setError(null);
    try {
      const [p, g, pr] = await Promise.all([
        apiGet<{ data: Product[] }>('/catalog/products?active=true'),
        apiGet<Grid>(`/intel/hal?date=${d}`),
        apiGet<Prev>(`/intel/hal/previous?date=${d}`),
      ]);
      setProducts(p.data.filter((x) => x.kind === 'SIMPLE'));
      setGrid(Object.fromEntries(g.data.map((r) => [r.productId, r])));
      setPrev(Object.fromEntries(pr.data.map((r) => [r.productId, r.price])));
      setInputs({});
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const kurus = (v: string) => (v.trim() === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100));
  function deviation(slug: string): number | null {
    const p = prev[slug]; const k = kurus(inputs[slug] ?? '');
    return p != null && k != null && p > 0 ? (k - p) / p : null;
  }

  function fillFromYesterday() {
    setInputs(Object.fromEntries(products.filter((p) => prev[p.slug] != null).map((p) => [p.slug, (prev[p.slug] / 100).toFixed(2)])));
  }

  async function saveAll() {
    const entries = products
      .map((p) => ({ productId: p.slug, price: kurus(inputs[p.slug] ?? '') }))
      .filter((e): e is { productId: string; price: number } => e.price != null && e.price >= 0);
    if (entries.length === 0) { setError('Kaydedilecek fiyat yok. En az bir ürüne bugünkü fiyatı gir.'); return; }
    // aykırı değer sayısı → toplu onay
    const outliers = products.filter((p) => { const d = deviation(p.slug); return d != null && Math.abs(d) >= OUTLIER_PCT; });
    if (outliers.length > 0 && !confirm(`${outliers.length} üründe %40+ sapma var (aykırı olabilir). Yine de ${entries.length} fiyatı kaydet?`)) return;
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('POST', '/intel/hal/bulk', { date, entries });
      setOk(`✓ ${entries.length} ürünün ${date} hal fiyatı kaydedildi.`);
      await load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addAdhoc() {
    const k = kurus(adhocPrice);
    if (!adhocSlug.trim() || k == null) { setError('Ürün slug ve fiyat gir.'); return; }
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('POST', '/intel/hal/entries', { productId: adhocSlug.trim(), price: k, date, source: 'MANUAL' });
      setAdhocSlug(''); setAdhocPrice('');
      await load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchIbb() {
    setIbbBusy(true); setError(null); setOk(null); setIbbRows(null);
    try {
      const q = new URLSearchParams({ date, side: ibbSide });
      if (ibbCat) q.set('category', ibbCat);
      const p = await apiGet<IbbPreview>(`/intel/hal/ibb/preview?${q.toString()}`);
      setIbbRows(p.rows);
      setIbbSlugs(Object.fromEntries(p.rows.map((r) => [r.sourceName, r.matchedSlug ?? ''])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIbbBusy(false);
    }
  }

  async function importAllIbb() {
    if (!confirm(`İBB'deki TÜM ürünler ${date} için içeri alınacak. Sistemde olmayanlar katalogda (yayın dışı) oluşturulacak. Devam?`)) return;
    setIbbBusy(true); setError(null); setOk(null); setIbbRows(null);
    try {
      const body: Record<string, unknown> = { date, createMissing: true, side: ibbSide };
      if (ibbCat) body.category = ibbCat;
      const r = await apiSend<{ totalRows: number; created: number; priced: number }>('POST', '/intel/hal/ibb/import', body);
      setOk(`✓ İBB içe aktarım: ${r.priced} ürün fiyatı yazıldı, ${r.created} yeni ürün oluşturuldu (${r.totalRows} satır tarandı).`);
      await load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIbbBusy(false);
    }
  }

  async function saveIbb() {
    if (!ibbRows) return;
    const chosen = ibbRows.map((r) => ({ r, slug: (ibbSlugs[r.sourceName] ?? '').trim() })).filter((x) => x.slug);
    if (chosen.length === 0) { setError('Eşleşen ürün yok — satırlara slug girin ya da katalogla eşleşen ürünleri kullan.'); return; }
    setIbbBusy(true); setError(null); setOk(null);
    try {
      // Yeni/değişen eşlemeleri kaydet (sonraki çekimde otomatik eşleşsin).
      await Promise.all(
        chosen.filter((x) => x.r.matchedSlug !== x.slug).map((x) =>
          apiSend('PUT', '/intel/hal/ibb/mappings', { sourceName: x.r.sourceName, productSlug: x.slug }).catch(() => {})),
      );
      const entries = chosen.map((x) => ({ productId: x.slug, price: x.r.price, source: 'IBB' }));
      await apiSend('POST', '/intel/hal/bulk', { date, entries });
      setOk(`✓ İBB'den ${entries.length} ürün fiyatı ${date} tarihine kaydedildi.`);
      setIbbRows(null);
      await load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIbbBusy(false);
    }
  }

  function exportCsv() {
    const header = ['Ürün', 'Slug', 'Birim', 'Dün (₺)', 'Bugün ort (₺)', 'Giriş', 'Değişim %'];
    const cell = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = products.map((p) => {
      const dun = prev[p.slug]; const g = grid[p.slug];
      const chg = dun && g ? Math.round(((g.dailyAverage - dun) / dun) * 100) : '';
      return [
        p.name, p.slug, p.unitLabel ?? '',
        dun != null ? (dun / 100).toFixed(2) : '',
        g ? (g.dailyAverage / 100).toFixed(2) : '',
        g?.count ?? '',
        chg === '' ? '' : `${chg}%`,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel TR
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hal_${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const enteredCount = products.filter((p) => (inputs[p.slug] ?? '').trim() !== '').length;

  return (
    <>
      <Topbar title="Hal Fiyatları" sub="Günlük toplu fiyat girişi (append-only)" />
      <div className="body">
        <p className="hint">
          Seçili gün için tüm ürünlerin hal fiyatını tek ekranda gir. <b>Dünden doldur</b> ile önceki
          günün fiyatlarını getir, gerekenleri değiştir, <b>Tümünü kaydet</b>. %40+ sapmada uyarılırsın.
          Günlük ortalama otomatik hesaplanır ve maliyet → fiyat öneri zincirini besler. <b>Excel'e aktar</b> ile CSV indir.
        </p>

        <div className="card" style={{ borderLeft: '3px solid var(--persimmon)' }}>
          <div className="ct">🏛️ İBB'den otomatik çek <span>Avrupa Yakası Hali · {date}</span></div>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="field"><label>Yaka</label>
              <select value={ibbSide} onChange={(e) => setIbbSide(e.target.value)}>
                <option value="avrupa">Avrupa</option>
                <option value="anadolu">Anadolu (deneysel)</option>
              </select>
            </div>
            <div className="field"><label>Kategori</label>
              <select value={ibbCat} onChange={(e) => setIbbCat(e.target.value)}>
                {IBB_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button className="btn" onClick={fetchIbb} disabled={ibbBusy}>{ibbBusy ? 'Çekiliyor…' : 'İBB\'den çek (önizle)'}</button>
            <button className="btn" onClick={importAllIbb} disabled={ibbBusy} style={{ background: 'var(--persimmon)' }}>{ibbBusy ? '…' : '⤵ Tümünü içeri al (eksikleri oluştur)'}</button>
            {ibbRows && <button className="btn ghost" onClick={saveIbb} disabled={ibbBusy}>Eşleşenleri hal&apos;e yaz</button>}
          </div>
          {ibbRows && (
            <>
              <p className="note2" style={{ marginTop: 8 }}>
                {ibbRows.length} ürün geldi · {ibbRows.filter((r) => (ibbSlugs[r.sourceName] ?? '').trim()).length} eşleşti.
                Fiyat = (en düşük + en yüksek) / 2. Eşleşmeyen satırlara slug yaz (kaydedince kalıcı eşleşir).
              </p>
              <table>
                <thead><tr><th>İBB ürünü</th><th>Kat.</th><th className="num">Düşük–Yüksek</th><th className="num">Fiyat (ort)</th><th>Ürün slug</th></tr></thead>
                <tbody>
                  {ibbRows.map((r) => {
                    const slug = ibbSlugs[r.sourceName] ?? '';
                    return (
                      <tr key={r.category + r.sourceName} style={slug ? undefined : { opacity: 0.55 }}>
                        <td>{r.sourceName}</td>
                        <td className="muted" style={{ fontSize: 11 }}>{r.category}</td>
                        <td className="num muted" style={{ fontSize: 11 }}>{tl(r.low)} – {tl(r.high)}</td>
                        <td className="num savecell">{tl(r.price)}</td>
                        <td><input className="cell" style={{ width: 130, textAlign: 'left' }} value={slug} placeholder="eşleşmedi" onChange={(e) => setIbbSlugs((s) => ({ ...s, [r.sourceName]: e.target.value }))} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="form-row" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
          <div className="field"><label>Gün</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <button className="btn ghost" onClick={fillFromYesterday} disabled={Object.keys(prev).length === 0}>Dünden doldur</button>
          <button className="btn" onClick={saveAll} disabled={busy || enteredCount === 0}>{busy ? 'Kaydediliyor…' : `Tümünü kaydet (${enteredCount})`}</button>
          <button className="btn ghost" onClick={exportCsv} disabled={products.length === 0}>⬇ Excel'e aktar (CSV)</button>
        </div>

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">Toplu günlük giriş <span>{products.length} ürün</span></div>
          {products.length === 0 ? (
            <p className="muted">Katalogda yayında ürün yok. Önce Ürün Kataloğu&apos;ndan ürün ekleyin (ya da aşağıdan tekil giriş).</p>
          ) : (
            <table>
              <thead>
                <tr><th>Ürün</th><th className="num">Dün</th><th className="num">Bugün (₺)</th><th className="num">Bugün ort.</th><th>Durum</th></tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const dev = deviation(p.slug);
                  const outlier = dev != null && Math.abs(dev) >= OUTLIER_PCT;
                  const g = grid[p.slug];
                  return (
                    <tr key={p.slug}>
                      <td>{p.name} <span className="muted" style={{ fontSize: 11 }}>{p.slug}</span></td>
                      <td className="num muted">{prev[p.slug] != null ? tl(prev[p.slug]) : '—'}</td>
                      <td className="num">
                        <input
                          className="cell" style={{ width: 90 }}
                          value={inputs[p.slug] ?? ''}
                          onChange={(e) => setInputs((s) => ({ ...s, [p.slug]: e.target.value }))}
                          placeholder={prev[p.slug] != null ? (prev[p.slug] / 100).toFixed(2) : '—'}
                        />
                      </td>
                      <td className="num savecell">{g ? tl(g.dailyAverage) : '—'}{g && g.count > 1 ? <span className="muted" style={{ fontSize: 10 }}> ({g.count})</span> : null}</td>
                      <td>
                        {outlier ? <span className="tagp zararina">⚠️ %{Math.round((dev as number) * 100)} sapma</span>
                          : dev != null && dev !== 0 ? <span className="tagp info">%{Math.round((dev as number) * 100) > 0 ? '+' : ''}{Math.round((dev as number) * 100)}</span>
                          : g ? <span className="tagp ok">girildi</span> : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <div className="ct">Tekil giriş (katalog dışı ürün)</div>
          <div className="form-row">
            <div className="field"><label>Ürün slug</label><input value={adhocSlug} onChange={(e) => setAdhocSlug(e.target.value)} placeholder="taze-fasulye" /></div>
            <div className="field"><label>Fiyat (₺)</label><input value={adhocPrice} onChange={(e) => setAdhocPrice(e.target.value)} placeholder="18,70" onKeyDown={(e) => e.key === 'Enter' && addAdhoc()} /></div>
            <button className="btn" onClick={addAdhoc} disabled={busy || !adhocSlug.trim() || !adhocPrice.trim()}>Ekle</button>
          </div>
        </div>
      </div>
    </>
  );
}
