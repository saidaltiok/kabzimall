'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import { tlToKurus } from '@/lib/money';
import Topbar from '@/components/Topbar';
import SectionTabs, { MARKET_TABS } from '@/components/SectionTabs';
import { ProductPicker } from '@/components/pickers';

interface DraftLine { key: string; slug: string; name: string; kgTl: string; totalTl: string }
interface Purchase { id: string; productSlug: string | null; recordedKg: number; actualKg: number | null; totalPaid: number; createdAt: string }

let seq = 0;
const newLine = (over: Partial<DraftLine> = {}): DraftLine => ({ key: `l${++seq}`, slug: '', name: '', kgTl: '', totalTl: '', ...over });

/** Görseli tarayıcıda ~1400px'e küçült + JPEG'e çevir (OCR payload'ı küçülsün). */
async function shrink(file: File): Promise<{ dataUrl: string; mediaType: string }> {
  const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(file); });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d'); if (!ctx) return { dataUrl, mediaType: file.type || 'image/jpeg' };
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.8), mediaType: 'image/jpeg' };
  } catch { return { dataUrl, mediaType: file.type || 'image/jpeg' }; }
}

export default function HalAlimPage() {
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [recent, setRecent] = useState<Purchase[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    apiGet<{ data: Purchase[] }>('/intel/hal-purchases').then((r) => setRecent(r.data.slice(0, 25))).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    apiGet<{ enabled: boolean }>('/intel/hal-purchases/ocr-status').then((r) => setOcrEnabled(r.enabled)).catch(() => {});
    apiGet<{ data: { slug: string; name: string }[] }>('/catalog/products').then((r) => { const m: Record<string, string> = {}; for (const p of r.data) m[p.slug] = p.name; setNames(m); }).catch(() => {});
  }, [load]);

  const setLine = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const addLine = () => setLines((ls) => [...ls, newLine()]);

  async function onFile(file: File) {
    setOcrBusy(true); setError(null); setOk(null);
    try {
      const { dataUrl, mediaType } = await shrink(file);
      const r = await apiSend<{ lines: { name: string; kg: number | null; totalPaid: number | null; matchedSlug: string | null }[]; note: string }>('POST', '/intel/hal-purchases/ocr', { image: dataUrl, mediaType });
      if (!r.lines.length) { setError('Faturada kalem okunamadı. Elle girebilirsiniz.'); return; }
      setLines(r.lines.map((l) => newLine({
        slug: l.matchedSlug ?? '', name: l.name,
        kgTl: l.kg != null ? String(l.kg).replace('.', ',') : '',
        totalTl: l.totalPaid != null ? (l.totalPaid / 100).toFixed(2).replace('.', ',') : '',
      })));
      setOk(`${r.lines.length} kalem okundu. Ürün eşleşmelerini ve tutarları kontrol edip kaydedin.`);
    } catch (e) { setError((e as Error).message); } finally { setOcrBusy(false); }
  }

  const parseKg = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const validLines = lines.filter((l) => l.slug && parseKg(l.kgTl) != null && tlToKurus(l.totalTl) != null);

  async function save() {
    setBusy(true); setError(null); setOk(null);
    let done = 0;
    try {
      for (const l of validLines) {
        await apiSend('POST', '/intel/hal-purchases', { productId: l.slug, recordedKg: parseKg(l.kgTl), actualKg: parseKg(l.kgTl), totalPaid: tlToKurus(l.totalTl) });
        done++;
      }
      setOk(`✓ ${done} hal alımı kaydedildi (kasadan çıkış olarak da düştü).`);
      setLines([newLine()]);
      load();
    } catch (e) { setError(`${done} kayıt yapıldı, sonra hata: ${(e as Error).message}`); load(); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Hal Alımı" sub="Bugün halden ne aldın? Fatura fotoğrafını yükle ya da elle gir — fiyatlamanın esası budur." />
      <div className="body">
        <SectionTabs tabs={MARKET_TABS} />
        <p className="hint">
          Buraya girdiğin <b>alış fiyatların</b>, Fiyat Kokpiti ve maliyet hesabının temelidir. Her alım
          kasadan <b>çıkış</b> olarak da düşer. Fatura fotoğrafını yükleyince sistem kalemleri okur
          (ürün · kg · tutar); sen kontrol edip kaydedersin.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">
            Alım kalemleri
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              <button className="btn ghost" style={{ fontSize: 12, padding: '6px 12px' }} disabled={ocrBusy} onClick={() => fileRef.current?.click()} title={ocrEnabled ? 'Fatura fotoğrafından oku' : 'OCR kapalı — ANTHROPIC_API_KEY gerekir; yine de deneyebilirsiniz'}>
                {ocrBusy ? '📷 Okunuyor…' : '📷 Faturadan oku'}
              </button>
            </span>
          </div>
          {!ocrEnabled && <p className="note2" style={{ marginTop: 0 }}>ℹ️ Fatura okuma (OCR) için <b>ANTHROPIC_API_KEY</b> tanımlı değil — kalemleri elle girebilir ya da anahtarı ekleyince otomatik okutabilirsiniz.</p>}
          <table>
            <thead><tr><th style={{ minWidth: 200 }}>Ürün</th><th className="num">Kg</th><th className="num">Ödenen (₺)</th><th className="num">Birim (₺/kg)</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const kg = parseKg(l.kgTl); const total = tlToKurus(l.totalTl);
                const unit = kg && total ? Math.round(total / kg) : null;
                return (
                  <tr key={l.key}>
                    <td>
                      <ProductPicker value={l.slug} onChange={(slug) => setLine(l.key, { slug })} placeholder={l.name ? `${l.name} — eşleştir` : 'Ürün seç…'} />
                      {l.name && !l.slug && <div className="muted" style={{ fontSize: 11 }}>faturada: “{l.name}” — eşleştir</div>}
                    </td>
                    <td className="num"><input className="cell" style={{ width: 70 }} value={l.kgTl} onChange={(e) => setLine(l.key, { kgTl: e.target.value })} placeholder="50" /></td>
                    <td className="num"><input className="cell" style={{ width: 90 }} value={l.totalTl} onChange={(e) => setLine(l.key, { totalTl: e.target.value })} placeholder="1.000,00" /></td>
                    <td className="num">{unit != null ? tl(unit) : <span className="muted">—</span>}</td>
                    <td className="num"><button className="btn ghost" style={{ padding: '3px 8px', color: 'var(--berry)' }} onClick={() => removeLine(l.key)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <button className="btn ghost" onClick={addLine}>+ Satır ekle</button>
            <button className="btn" style={{ marginLeft: 'auto' }} disabled={busy || validLines.length === 0} onClick={save}>
              {busy ? 'Kaydediliyor…' : `Kaydet (${validLines.length} alım)`}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Son alımlar <span>{recent.length}</span></div>
          {recent.length === 0 ? (
            <p className="muted">Henüz hal alımı kaydı yok.</p>
          ) : (
            <table>
              <thead><tr><th>Zaman</th><th>Ürün</th><th className="num">Kg</th><th className="num">Ödenen</th><th className="num">Birim (₺/kg)</th></tr></thead>
              <tbody>
                {recent.map((p) => {
                  const kg = p.actualKg ?? p.recordedKg;
                  return (
                    <tr key={p.id}>
                      <td className="muted" style={{ fontSize: 11.5 }}>{dt(p.createdAt)}</td>
                      <td>{p.productSlug ? (names[p.productSlug] ?? p.productSlug) : '—'}</td>
                      <td className="num">{kg}</td>
                      <td className="num">{tl(p.totalPaid)}</td>
                      <td className="num savecell">{kg > 0 ? tl(Math.round(p.totalPaid / kg)) : '—'}</td>
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
