'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';

interface Product { id: string; slug: string; name: string }
interface BasketItem { qty: number; product: { slug: string; name: string } }
interface Basket { id: string; slug: string; name: string; description: string | null; discountPct: number; items: BasketItem[] }

export default function SepetlerPage() {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [discount, setDiscount] = useState('10');
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
      setProducts(p.data);
      if (!pickSlug && p.data[0]) setPickSlug(p.data[0].slug);
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
      await apiSend('POST', '/catalog/baskets', {
        slug, name, description: description || undefined,
        discountPct: discount === '' ? 0 : Number(discount),
        items: staged.map((s) => ({ productSlug: s.productSlug, qty: Number(s.qty.replace(',', '.')) })),
      });
      setOk(`✓ ${name} oluşturuldu.`);
      setSlug(''); setName(''); setDescription(''); setDiscount('10'); setStaged([]);
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
      <Topbar title="Hazır Sepetler" sub="Tek tıkla sepete eklenen ürün demetleri" />
      <div className="body">
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">Yeni sepet</div>
          <div className="form-row">
            <div className="field"><label>Slug</label><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="haftalik-sebze" /></div>
            <div className="field"><label>Ad</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Haftalık Sebze Sepeti" /></div>
            <div className="field"><label>İndirim (%)</label><input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="10" style={{ minWidth: 80 }} /></div>
            <div className="field" style={{ flex: 1 }}><label>Açıklama</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="4 kişilik, 5 çeşit" /></div>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Ürün</label>
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
            <button className="btn" onClick={create} disabled={!slug || !name || staged.length === 0}>Sepeti oluştur</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Sepetler <span>{baskets.length}</span></div>
          {baskets.length === 0 ? (
            <p className="muted">Henüz hazır sepet yok.</p>
          ) : (
            <table>
              <thead><tr><th>Ad</th><th>Slug</th><th>İçerik</th><th></th></tr></thead>
              <tbody>
                {baskets.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b>{b.discountPct > 0 && <span className="tagp ok" style={{ marginLeft: 6 }}>%{b.discountPct}</span>}{b.description && <div className="muted" style={{ fontSize: 11 }}>{b.description}</div>}</td>
                    <td className="muted">{b.slug}</td>
                    <td>{b.items.map((it) => `${it.product.name}×${it.qty}`).join(', ')}</td>
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
