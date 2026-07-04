'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRODUCTS_TABS } from '@/components/SectionTabs';

interface Category { id: string; name: string; slug: string }
interface Product {
  id: string; slug: string; name: string; kind: string; saleType: string; unitLabel: string | null;
  imageUrl: string | null; basePrice: number | null; discountedPrice: number | null; stockQty: number | null; maxPerOrder: number | null; originRegion: string | null;
  isActive: boolean; isFeatured: boolean; isFreshDaily: boolean; isLocal: boolean;
  category: { id: string; name: string } | null;
}

/** Görseli tarayıcıda küçült/sıkıştır → JPEG data URL (harici depolama gerekmez). */
async function resizeImage(file: File, maxSide: number, quality: number): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
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
  priceTl: '', discountedTl: '', originRegion: '', imageUrl: '', stockQty: '', maxPerOrder: '', isActive: true, isFeatured: false, isFreshDaily: false, isLocal: false,
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
      maxPerOrder: p.maxPerOrder != null ? String(p.maxPerOrder) : '',
      isActive: p.isActive, isFeatured: p.isFeatured,
      isFreshDaily: p.isFreshDaily, isLocal: p.isLocal,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditing(false); setForm({ ...empty }); setError(null); setOk(null); }

  async function save() {
    setBusy(true); setError(null); setOk(null);
    try {
      // Boş bırakılan opsiyonel alan → null gönder (panelden "sınırsız/yok"a geri dönülebilsin).
      const strOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
      const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
      const kurusOrNull = (v: string) => (v.trim() === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100));
      const payload: Record<string, unknown> = {
        name: form.name, saleType: form.saleType,
        unitLabel: strOrNull(form.unitLabel), categoryId: strOrNull(form.categoryId),
        basePrice: kurusOrNull(form.priceTl), originRegion: strOrNull(form.originRegion), imageUrl: strOrNull(form.imageUrl),
        stockQty: numOrNull(form.stockQty),
        maxPerOrder: numOrNull(form.maxPerOrder),
        discountedPrice: kurusOrNull(form.discountedTl),
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

    async function pickImage(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) { setError('Lütfen bir görsel dosyası seçin.'); return; }
    try {
      const dataUrl = await resizeImage(file, 800, 0.72);
      setForm((s) => ({ ...s, imageUrl: dataUrl }));
    } catch {
      setError('Görsel okunamadı.');
    }
  }

  const setF = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <>
      <Topbar title="Ürün Kataloğu" sub="Ürün ve kategori yönetimi" />
      <div className="body">
        <SectionTabs tabs={PRODUCTS_TABS} />
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
              <label>Maks/sipariş (boş=yok)</label>
              <input value={form.maxPerOrder} onChange={setF('maxPerOrder')} placeholder="∞" style={{ minWidth: 90 }} />
            </div>
            <div className="field">
              <label>Menşei / yöre</label>
              <input value={form.originRegion} onChange={setF('originRegion')} placeholder="Aydın" style={{ minWidth: 110 }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Görsel (dosya yükle ya da URL)</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {form.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt="önizleme" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                )}
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f); e.target.value = ''; }} style={{ fontSize: 12 }} />
                {form.imageUrl && <button type="button" className="btn ghost" style={{ padding: '5px 9px', fontSize: 12 }} onClick={() => setForm((s) => ({ ...s, imageUrl: '' }))}>Kaldır</button>}
              </div>
              <input value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl} onChange={setF('imageUrl')} placeholder="…ya da https://… .jpg" style={{ minWidth: 200, marginTop: 6 }} />
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
