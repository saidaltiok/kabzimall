'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRODUCTS_TABS } from '@/components/SectionTabs';
import { tlToKurus } from '@/lib/money';

interface Product { id: string; slug: string; name: string; kind: string }
interface Component { slug: string; name: string; unitLabel: string | null; qty: number }
interface Basket {
  id: string; slug: string; name: string; basePrice: number | null; discountedPrice: number | null;
  stockQty: number | null; components: Component[];
}

export default function SepetlerPage() {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [priceTl, setPriceTl] = useState('');
  const [discTl, setDiscTl] = useState('');
  const [staged, setStaged] = useState<{ productSlug: string; qty: string }[]>([]);
  const [pickSlug, setPickSlug] = useState('');
  const [pickQty, setPickQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([
        apiGet<{ data: Basket[] }>('/catalog/baskets'),
        apiGet<{ data: Product[] }>('/catalog/products'),
      ]);
      setBaskets(b.data);
      const simple = p.data.filter((x) => x.kind !== 'BASKET');
      setProducts(simple);
      if (!pickSlug && simple[0]) setPickSlug(simple[0].slug);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pickSlug]);
  useEffect(() => { load(); }, [load]);

  function addStaged() {
    if (!pickSlug || !pickQty) return;
    setStaged((s) => [...s.filter((x) => x.productSlug !== pickSlug), { productSlug: pickSlug, qty: pickQty }]);
  }

  async function create() {
    setError(null); setOk(null);
    try {
      if (staged.length === 0) { setError('En az bir ürün ekleyin.'); return; }
      if (!priceTl) { setError('Sepet fiyatı gerekli.'); return; }
      await apiSend('POST', '/catalog/baskets', {
        slug, name,
        basePrice: (tlToKurus(priceTl) ?? 0),
        discountedPrice: tlToKurus(discTl) ?? undefined,
        components: staged.map((s) => ({ productSlug: s.productSlug, qty: Number(s.qty.replace(',', '.')) })),
      });
      setOk(`✓ ${name} oluşturuldu.`);
      setSlug(''); setName(''); setPriceTl(''); setDiscTl(''); setStaged([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Sepet silinsin mi?')) return;
    try { await apiSend('DELETE', `/catalog/baskets/${id}`); await load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Topbar title="Hazır Sepetler" sub="Her sepet ayrı bir üründür — kendi fiyatı + içeriği" />
      <div className="body">
        <SectionTabs tabs={PRODUCTS_TABS} />
        <p className="hint">
          Hazır sepet ayrı bir üründür: <b>kendi fiyatını ve indirimini</b> sen belirlersin (diğer
          ürünler gibi). İçindeki ürünler yalnızca müşteriye gösterim ve paketleme içindir. Fiyat/stok/
          indirimini sonradan <b>Ürün Kataloğu</b>'ndan da düzenleyebilirsin.
        </p>
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">Yeni sepet</div>
          <div className="form-row">
            <div className="field"><label>Slug</label><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="haftalik-sebze" /></div>
            <div className="field"><label>Ad</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Haftalık Sebze Sepeti" /></div>
            <div className="field"><label>Fiyat (₺)</label><input value={priceTl} onChange={(e) => setPriceTl(e.target.value)} placeholder="110,00" style={{ minWidth: 100 }} /></div>
            <div className="field"><label>İndirimli (₺)</label><input value={discTl} onChange={(e) => setDiscTl(e.target.value)} placeholder="—" style={{ minWidth: 100 }} /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>İçeriğe ürün ekle</label>
              <select value={pickSlug} onChange={(e) => setPickSlug(e.target.value)}>
                {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Miktar</label><input value={pickQty} onChange={(e) => setPickQty(e.target.value)} style={{ minWidth: 80 }} /></div>
            <button className="btn ghost" onClick={addStaged}>Ekle</button>
          </div>
          {staged.length > 0 && (
            <div className="pchips" style={{ marginTop: 10 }}>
              {staged.map((s) => (
                <div className="pchip" key={s.productSlug}>
                  {products.find((p) => p.slug === s.productSlug)?.name ?? s.productSlug} × {s.qty}
                  <span style={{ cursor: 'pointer', color: 'var(--berry)' }} onClick={() => setStaged((x) => x.filter((y) => y.productSlug !== s.productSlug))}> ✕</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={create} disabled={!slug || !name || !priceTl || staged.length === 0}>Sepeti oluştur</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Sepetler <span>{baskets.length}</span></div>
          {baskets.length === 0 ? (
            <p className="muted">Henüz hazır sepet yok.</p>
          ) : (
            <table>
              <thead><tr><th>Ad</th><th>Slug</th><th className="num">Fiyat</th><th>İçerik</th><th></th></tr></thead>
              <tbody>
                {baskets.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b></td>
                    <td className="muted">{b.slug}</td>
                    <td className="num savecell">
                      {b.discountedPrice != null && b.basePrice != null && b.discountedPrice < b.basePrice ? (
                        <>{tl(b.discountedPrice)} <s style={{ color: 'var(--muted)', fontWeight: 400 }}>{tl(b.basePrice)}</s></>
                      ) : tl(b.basePrice)}
                    </td>
                    <td>{b.components.map((c) => `${c.name}×${c.qty}`).join(', ')}</td>
                    <td className="num"><button className="btn ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => remove(b.id)}>Sil</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
