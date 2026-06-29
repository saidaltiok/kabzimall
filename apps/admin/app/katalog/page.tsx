'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface Category { id: string; name: string; slug: string }
interface Product {
  id: string; slug: string; name: string; kind: string; saleType: string; unitLabel: string | null;
  imageUrl: string | null; basePrice: number | null; discountedPrice: number | null; stockQty: number | null; originRegion: string | null;
  isActive: boolean; isFeatured: boolean; isFreshDaily: boolean; isLocal: boolean;
  category: { id: string; name: string } | null;
}

const SALE_TYPES: [string, string][] = [
  ['WEIGHT', 'Kilo (kg)'],
  ['PIECE', 'Adet'],
  ['BUNCH', 'Demet'],
  ['PACK', 'Paket'],
  ['VARIABLE_WEIGHT_PACK', 'Yaklaşık gramajlı paket'],
];

const empty = {
  id: '', slug: '', name: '', categoryId: '', saleType: 'WEIGHT', unitLabel: 'kg',
  priceTl: '', discountedTl: '', originRegion: '', imageUrl: '', stockQty: '', isActive: true, isFeatured: false, isFreshDaily: false, isLocal: false,
};

export default function KatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catSlug, setCatSlug] = useState('');
  const [catName, setCatName] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        apiGet<{ data: Product[] }>('/catalog/products'),
        apiGet<{ data: Category[] }>('/catalog/categories'),
      ]);
      setProducts(p.data);
      setCategories(c.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function edit(p: Product) {
    setEditing(true);
    setError(null); setOk(null);
    setForm({
      id: p.id, slug: p.slug, name: p.name, categoryId: p.category?.id ?? '', saleType: p.saleType,
      unitLabel: p.unitLabel ?? '', priceTl: p.basePrice != null ? (p.basePrice / 100).toFixed(2) : '',
      discountedTl: p.discountedPrice != null ? (p.discountedPrice / 100).toFixed(2) : '',
      originRegion: p.originRegion ?? '', imageUrl: p.imageUrl ?? '', stockQty: p.stockQty != null ? String(p.stockQty) : '',
      isActive: p.isActive, isFeatured: p.isFeatured,
      isFreshDaily: p.isFreshDaily, isLocal: p.isLocal,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditing(false); setForm({ ...empty }); setError(null); setOk(null); }

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      const basePrice = form.priceTl ? Math.round(parseFloat(form.priceTl.replace(',', '.')) * 100) : undefined;
      const payload: Record<string, unknown> = {
        name: form.name, saleType: form.saleType,
        unitLabel: form.unitLabel || undefined, categoryId: form.categoryId || undefined,
        basePrice, originRegion: form.originRegion || undefined, imageUrl: form.imageUrl || undefined,
        stockQty: form.stockQty === '' ? undefined : Number(form.stockQty),
        discountedPrice: form.discountedTl === '' ? undefined : Math.round(parseFloat(form.discountedTl.replace(',', '.')) * 100),
        isActive: form.isActive, isFeatured: form.isFeatured, isFreshDaily: form.isFreshDaily, isLocal: form.isLocal,
      };
      if (editing) {
        await apiSend('PATCH', `/catalog/products/${form.id}`, payload);
        setOk(`✓ ${form.name} güncellendi.`);
      } else {
        await apiSend('POST', '/catalog/products', { slug: form.slug, ...payload });
        setOk(`✓ ${form.name} eklendi.`);
      }
      reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Product) {
    if (!confirm(`${p.name} silinsin mi? (Geçmişi varsa pasifleştirin)`)) return;
    setError(null); setOk(null);
    try {
      await apiSend('DELETE', `/catalog/products/${p.id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addCategory() {
    if (!catSlug || !catName) return;
    try {
      await apiSend('POST', '/catalog/categories', { slug: catSlug, name: catName });
      setCatSlug(''); setCatName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const setF = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <>
      <Topbar title="Ürün Kataloğu" sub="Ürün ve kategori yönetimi" />
      <div className="body">
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">{editing ? `Düzenle — ${form.slug}` : 'Yeni ürün'}</div>
          <div className="form-row">
            <div className="field">
              <label>Slug {editing && '(değişmez)'}</label>
              <input value={form.slug} onChange={setF('slug')} disabled={editing} placeholder="cilek" />
            </div>
            <div className="field">
              <label>Ad</label>
              <input value={form.name} onChange={setF('name')} placeholder="Çilek" />
            </div>
            <div className="field">
              <label>Kategori</label>
              <select value={form.categoryId} onChange={setF('categoryId')}>
                <option value="">(kategorisiz)</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Satış tipi</label>
              <select value={form.saleType} onChange={setF('saleType')}>
                {SALE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Birim etiketi</label>
              <input value={form.unitLabel} onChange={setF('unitLabel')} placeholder="kg" style={{ minWidth: 90 }} />
            </div>
            <div className="field">
              <label>Mağaza fiyatı (₺)</label>
              <input value={form.priceTl} onChange={setF('priceTl')} placeholder="64,00" style={{ minWidth: 110 }} />
            </div>
            <div className="field">
              <label>İndirimli (₺, boş=yok)</label>
              <input value={form.discountedTl} onChange={setF('discountedTl')} placeholder="—" style={{ minWidth: 110 }} />
            </div>
            <div className="field">
              <label>Stok (boş=sınırsız)</label>
              <input value={form.stockQty} onChange={setF('stockQty')} placeholder="∞" style={{ minWidth: 90 }} />
            </div>
            <div className="field">
              <label>Menşei / yöre</label>
              <input value={form.originRegion} onChange={setF('originRegion')} placeholder="Aydın" style={{ minWidth: 110 }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Görsel URL</label>
              <input value={form.imageUrl} onChange={setF('imageUrl')} placeholder="https://… .jpg" style={{ minWidth: 200 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0', fontSize: 13 }}>
            <label><input type="checkbox" checked={form.isActive} onChange={setF('isActive')} /> Yayında</label>
            <label><input type="checkbox" checked={form.isFeatured} onChange={setF('isFeatured')} /> Vitrin</label>
            <label><input type="checkbox" checked={form.isFreshDaily} onChange={setF('isFreshDaily')} /> Günlük taze</label>
            <label><input type="checkbox" checked={form.isLocal} onChange={setF('isLocal')} /> Yöresel</label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={save} disabled={busy || !form.slug || !form.name}>
              {editing ? 'Güncelle' : 'Ekle'}
            </button>
            {editing && <button className="btn ghost" onClick={reset}>İptal</button>}
          </div>
        </div>

        <div className="card">
          <div className="ct">Ürünler <span>{products.length}</span></div>
          {products.length === 0 ? (
            <p className="muted">Henüz ürün yok. Yukarıdan ekle.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ad</th><th>Slug</th><th>Kategori</th><th>Tip</th>
                  <th className="num">Fiyat</th><th className="num">Stok</th><th>Durum</th><th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }} />
                        )}
                        {p.name}{p.isFreshDaily && ' 🌿'}
                        {p.kind === 'BASKET' && <span className="tagp info" style={{ marginLeft: 4 }}>paket</span>}
                      </span>
                    </td>
                    <td className="muted">{p.slug}</td>
                    <td>{p.category?.name ?? '—'}</td>
                    <td>{SALE_TYPES.find((s) => s[0] === p.saleType)?.[1] ?? p.saleType}</td>
                    <td className="num savecell">
                      {p.discountedPrice != null && p.basePrice != null && p.discountedPrice < p.basePrice ? (
                        <>{tl(p.discountedPrice)} <s style={{ color: 'var(--muted)', fontWeight: 400 }}>{tl(p.basePrice)}</s></>
                      ) : (
                        tl(p.basePrice)
                      )}
                    </td>
                    <td className="num">
                      {p.stockQty == null ? <span className="muted">∞</span> : p.stockQty <= 0 ? <span className="tagp zararina">tükendi</span> : p.stockQty}
                    </td>
                    <td><span className={`tagp ${p.isActive ? 'ok' : 'up'}`}>{p.isActive ? 'Yayında' : 'Pasif'}</span></td>
                    <td className="num">
                      <button className="btn ghost" style={{ fontSize: 11, padding: '5px 9px', marginRight: 6 }} onClick={() => edit(p)}>Düzenle</button>
                      <button className="btn ghost" style={{ fontSize: 11, padding: '5px 9px' }} onClick={() => remove(p)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="ct">Kategoriler <span>{categories.length}</span></div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="field"><label>Slug</label><input value={catSlug} onChange={(e) => setCatSlug(e.target.value)} placeholder="meyve" /></div>
            <div className="field"><label>Ad</label><input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Meyve" /></div>
            <button className="btn ghost" onClick={addCategory} disabled={!catSlug || !catName}>Kategori ekle</button>
          </div>
          <div className="pchips">
            {categories.map((c) => <div key={c.id} className="pchip">{c.name}</div>)}
            {categories.length === 0 && <span className="muted">Henüz kategori yok.</span>}
          </div>
        </div>
      </div>
    </>
  );
}
