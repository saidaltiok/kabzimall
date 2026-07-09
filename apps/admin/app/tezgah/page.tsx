'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl, dt } from '@/lib/format';
import { tlToKurus } from '@/lib/money';
import Topbar from '@/components/Topbar';

interface Product {
  slug: string; name: string; kind: string; unitLabel: string | null;
  basePrice: number | null; discountedPrice: number | null; stockQty: number | null; isActive: boolean;
}
interface Line { slug: string; name: string; unitLabel: string | null; qty: string; priceTl: string }
interface PosSale {
  id: string; code: string; status: string; finalTotal: number; createdAt: string; note: string | null; paymentMethod: string;
  items: { productName: string; orderedQty: number; unitLabel: string | null; lineTotal: number }[];
}
interface Today { total: number; count: number; byMethod: Record<string, number>; sales: PosSale[] }

/** Ödeme yöntemleri — yalnız Nakit kasadaki nakde eklenir; diğerleri bankaya/karta gider. */
const PAYMENTS: { id: string; label: string; icon: string }[] = [
  { id: 'CASH', label: 'Nakit', icon: '💵' },
  { id: 'CARD', label: 'Kredi/Banka Kartı', icon: '💳' },
  { id: 'MULTINET', label: 'Multinet', icon: '🍽️' },
  { id: 'SETCARD', label: 'Setcard', icon: '🍽️' },
  { id: 'EDENRED', label: 'Edenred', icon: '🍽️' },
  { id: 'METROPOL', label: 'Metropol', icon: '🍽️' },
  { id: 'TOKENFLEX', label: 'Token Flex', icon: '🍽️' },
];
const payLabel = (id: string) => PAYMENTS.find((p) => p.id === id)?.label ?? id;

/** İndirim varsa vitrindeki geçerli fiyat, yoksa taban fiyat (kuruş). */
const effective = (p: Product) =>
  p.discountedPrice != null && p.basePrice != null && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;

const toTl = (k: number | null) => (k == null ? '' : (k / 100).toFixed(2).replace('.', ','));

/**
 * Tezgâh Satışı — dükkânda tartılan ürünü 3 tıkla kaydet: stok düşer, nakit
 * kasaya işler (kasa kapalıysa askıda birikir), ciro/K-Z raporlarına dahil olur.
 * Web sipariş akışına (pano/liste/müşteriler) karışmaz.
 */
export default function TezgahPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = useCallback(() => {
    apiGet<{ data: Product[] }>('/catalog/products?active=true').then((r) => setProducts(r.data)).catch((e) => setError((e as Error).message));
    apiGet<Today>('/admin/pos/today').then(setToday).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    const list = q ? products.filter((p) => p.name.toLocaleLowerCase('tr').includes(q) || p.slug.includes(q)) : products;
    return list.slice(0, 30);
  }, [products, search]);

  function addLine(p: Product) {
    setOk(null); setWarnings([]);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.slug === p.slug);
      if (i >= 0) {
        // aynı ürüne tekrar tıklandı → miktarı 1 artır (kg'da da pratik)
        const next = [...ls];
        const cur = parseFloat(next[i].qty.replace(',', '.')) || 0;
        next[i] = { ...next[i], qty: String(cur + 1).replace('.', ',') };
        return next;
      }
      return [...ls, { slug: p.slug, name: p.name, unitLabel: p.unitLabel, qty: '1', priceTl: toTl(effective(p)) }];
    });
  }
  const setLine = (slug: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.slug === slug ? { ...l, ...patch } : l)));
  const removeLine = (slug: string) => setLines((ls) => ls.filter((l) => l.slug !== slug));

  const lineKurus = (l: Line) => {
    const qty = parseFloat(l.qty.replace(',', '.'));
    const price = tlToKurus(l.priceTl);
    if (!qty || qty <= 0 || price == null || price <= 0) return null;
    return Math.round(qty * price);
  };
  const total = lines.reduce((s, l) => s + (lineKurus(l) ?? 0), 0);
  const allValid = lines.length > 0 && lines.every((l) => lineKurus(l) != null);

  async function collect() {
    setBusy(true); setError(null); setOk(null); setWarnings([]);
    try {
      const items = lines.map((l) => ({
        slug: l.slug,
        qty: parseFloat(l.qty.replace(',', '.')),
        unitPrice: tlToKurus(l.priceTl)!,
      }));
      const r = await apiSend<{ code: string; finalTotal: number; warnings: string[] }>('POST', '/admin/pos/sales', {
        items, note: note.trim() || undefined, paymentMethod: payment,
      });
      const dest = payment === 'CASH' ? 'nakit kasaya işlendi' : `${payLabel(payment)} ile tahsil edildi (kasaya girmez)`;
      setOk(`✓ ${r.code} · ${items.length} kalem · ${tl(r.finalTotal)} — ${dest}.`);
      setWarnings(r.warnings ?? []);
      setLines([]); setNote(''); setPayment('CASH'); load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function refund(s: PosSale) {
    const cashLine = s.paymentMethod === 'CASH' ? `${tl(s.finalTotal)} kasadan düşülür (kasa kapalıysa askıda bekler)` : `${payLabel(s.paymentMethod)} ödemesi iade edilir (kasaya dokunmaz)`;
    if (!window.confirm(`${s.code} iade edilsin mi? Stok geri yüklenir, ${cashLine}.`)) return;
    setBusy(true); setError(null);
    try { await apiSend('PATCH', `/admin/orders/${s.id}/status`, { status: 'CANCELLED' }); load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Tezgâh Satışı" sub="ürün seç → miktar/fiyat → nakit tahsil · stok ve kasa otomatik işler" />
      <div className="body">
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}
        {warnings.map((w, i) => <div className="error" key={i} style={{ background: '#fff7ed', borderColor: 'var(--honey)', color: '#7c4a03' }}>⚠ {w}</div>)}

        <div className="grid2">
          <div className="card">
            <div className="ct">Ürün seç</div>
            <input placeholder="Ara: domates, çilek…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {filtered.map((p) => {
                const price = effective(p);
                return (
                  <button
                    key={p.slug} type="button" onClick={() => addLine(p)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
                  >
                    <span>
                      {p.name} <span className="muted" style={{ fontSize: 11 }}>/{p.unitLabel ?? 'adet'}</span>
                      {p.stockQty != null && p.stockQty <= 0 && <span className="tagp zararina" style={{ marginLeft: 6 }}>stok 0</span>}
                    </span>
                    <b>{price != null ? tl(price) : <span className="tagp info">fiyat gir</span>}</b>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="muted">Eşleşen ürün yok.</p>}
            </div>
          </div>

          <div className="card">
            <div className="ct">Fiş <span>{lines.length} kalem</span></div>
            {lines.length === 0 ? (
              <p className="muted">Soldan ürün seç — aynı ürüne tekrar tıklamak miktarı artırır.</p>
            ) : (
              <table>
                <thead><tr><th>Ürün</th><th className="num">Miktar</th><th className="num">Birim ₺</th><th className="num">Satır</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l) => {
                    const lk = lineKurus(l);
                    return (
                      <tr key={l.slug}>
                        <td>{l.name} <span className="muted" style={{ fontSize: 11 }}>/{l.unitLabel ?? 'adet'}</span></td>
                        <td className="num"><input className="cell" value={l.qty} onChange={(e) => setLine(l.slug, { qty: e.target.value })} style={{ width: 62 }} /></td>
                        <td className="num"><input className="cell" value={l.priceTl} onChange={(e) => setLine(l.slug, { priceTl: e.target.value })} placeholder="0,00" style={{ width: 76 }} /></td>
                        <td className="num" style={{ fontWeight: 700 }}>{lk != null ? tl(lk) : <span className="tagp risk">eksik</span>}</td>
                        <td><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 12, color: 'var(--berry)' }} onClick={() => removeLine(l.slug)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="field" style={{ marginTop: 12 }}>
              <label>Ödeme yöntemi</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PAYMENTS.map((p) => (
                  <button
                    key={p.id} type="button" onClick={() => setPayment(p.id)}
                    style={{ border: `1.5px solid ${payment === p.id ? 'var(--forest)' : 'var(--line)'}`, background: payment === p.id ? 'var(--forest)' : '#fff', color: payment === p.id ? '#fff' : 'inherit', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              {payment !== 'CASH' && <p className="note2" style={{ margin: '6px 0 0' }}>Kart/yemek kartı ödemesi <b>kasadaki nakde eklenmez</b> (bankaya/karta gider); ciro ve rapora yine dahildir.</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label>Not (ops. — fişte kalır)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="pazarlıklı / komşu esnaf" maxLength={300} />
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 11.5 }}>TOPLAM</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{tl(total)}</div>
              </div>
              <button className="btn" style={{ background: 'var(--forest)', fontSize: 14, padding: '10px 18px' }} disabled={busy || !allValid} onClick={collect}>
                {payment === 'CASH' ? '💵' : PAYMENTS.find((p) => p.id === payment)?.icon} Tahsil et
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="ct">Bugünün fişleri <span>{today ? `${today.count} fiş · ${tl(today.total)}` : '—'}</span></div>
          {today && today.byMethod && Object.keys(today.byMethod).length > 0 && (
            <div className="miniinfo" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
              {Object.entries(today.byMethod).map(([m, v]) => (
                <span key={m}>{payLabel(m)}: <b>{tl(v)}</b></span>
              ))}
            </div>
          )}
          {!today || today.sales.length === 0 ? (
            <p className="muted">Bugün tezgâh satışı yok.</p>
          ) : (
            <table>
              <thead><tr><th>Saat</th><th>Fiş</th><th>Kalemler</th><th>Ödeme</th><th className="num">Tutar</th><th></th></tr></thead>
              <tbody>
                {today.sales.map((s) => (
                  <tr key={s.id} style={s.status === 'CANCELLED' ? { opacity: 0.5 } : undefined}>
                    <td className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{dt(s.createdAt)}</td>
                    <td>
                      {s.status === 'CANCELLED' && <span className="tagp zararina" style={{ marginRight: 6 }}>iade</span>}
                      <b>{s.code}</b>{s.note && <span className="muted" style={{ fontSize: 11 }}> · {s.note}</span>}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{s.items.map((it) => `${it.productName} ${it.orderedQty}${it.unitLabel === 'kg' ? 'kg' : ''}`).join(' · ')}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{payLabel(s.paymentMethod)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{s.status === 'CANCELLED' ? <s>{tl(s.finalTotal)}</s> : tl(s.finalTotal)}</td>
                    <td className="num">
                      {s.status === 'CANCELLED'
                        ? <span className="muted">—</span>
                        : <button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={busy} onClick={() => refund(s)}>↩ İade</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note2" style={{ marginTop: 8 }}>
            İade: stok geri yüklenir, tutar kasadan <b>SALE_REVERSAL</b> olarak düşer. Kasa kapalıyken yapılan
            satışlar kaybolmaz — kasa açılınca oturuma bağlanır.
          </p>
        </div>
      </div>
    </>
  );
}
