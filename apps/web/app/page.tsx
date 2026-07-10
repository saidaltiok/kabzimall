'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, customerSession } from '@/lib/api';
import { tl } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useFavs } from '@/lib/favs';
import { getOrderHistory } from '@/lib/orders';
import ProductCard, { CardProduct } from '@/components/ProductCard';
import Icon from '@/components/Icon';

interface Product extends CardProduct {
  isFeatured: boolean;
  createdAt: string;
}
interface Category { slug: string; name: string }
interface Banner { id: string; kicker: string | null; title: string; subtitle: string | null; couponCode: string | null }
interface BasketComponent { slug: string; name: string; unitLabel: string | null; qty: number }
interface Basket {
  slug: string; name: string; imageUrl: string | null; unitLabel: string | null;
  basePrice: number; discountedPrice: number | null; price: number; stockQty: number | null;
  components: BasketComponent[];
}

const NEW_WINDOW_DAYS = 21; // "Yeni gelenler" penceresi (kendiliğinden temizlenir)
/** Kategori simgeleri — hi-fi mockup'takiyle aynı, temiz ve büyük emoji. */
const CAT_ICON: Record<string, string> = { meyve: '🍑', sebze: '🥬', yoresel: '🏺' };

/** URL '?kategori=' parametresini kategori filtresine bağlar (header/footer linkleri). */
function KategoriReader({ onCat }: { onCat: (c: string) => void }) {
  const sp = useSearchParams();
  useEffect(() => {
    const k = sp.get('kategori');
    if (k) onCat(k);
  }, [sp, onCat]);
  return null;
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bIdx, setBIdx] = useState(0);
  const [frequentSlugs, setFrequentSlugs] = useState<string[]>([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const { add, items } = useCart();
  const { favs } = useFavs();

  const inCart = (slug: string) => items.find((i) => i.slug === slug && !i.basketSlug)?.qty ?? 0;

  function flash(name: string) {
    setToast(`${name} sepete eklendi`);
    window.setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    Promise.all([
      apiGet<{ data: Product[] }>('/storefront/products'),
      apiGet<{ data: Category[] }>('/storefront/categories'),
      apiGet<{ data: Basket[] }>('/storefront/baskets'),
    ])
      .then(([p, c, b]) => { setProducts(p.data); setCategories(c.data); setBaskets(b.data); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    apiGet<{ data: Banner[] }>('/storefront/banners').then((r) => setBanners(r.data ?? [])).catch(() => {});

    // "Sık Aldıkların": son 5 siparişte 2+ kez geçen ürünler (girişliyse sunucudan, değilse bu cihazdan).
    (async () => {
      try {
        interface OrderLite { items: { product: { slug: string } | null }[] }
        let orders: OrderLite[] = [];
        const s = customerSession();
        if (s) {
          const r = await apiGet<{ data: OrderLite[] }>('/storefront/my-orders', { Authorization: `Bearer ${s.token}` });
          orders = r.data.slice(0, 5);
        } else {
          const refs = getOrderHistory().slice(0, 5);
          orders = (await Promise.all(refs.map((ref) => apiGet<OrderLite>(`/storefront/orders/${ref.id}`).catch(() => null)))).filter(Boolean) as OrderLite[];
        }
        const count = new Map<string, number>();
        for (const o of orders) for (const it of o.items ?? []) {
          const slug = it.product?.slug;
          if (slug) count.set(slug, (count.get(slug) ?? 0) + 1);
        }
        setFrequentSlugs([...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([slug]) => slug).slice(0, 10));
      } catch { /* raf isteğe bağlı — sessiz geç */ }
    })();
  }, []);

  // Banner carousel — birden çok aktif banner varsa 6 sn'de bir döner.
  useEffect(() => {
    if (banners.length < 2) return;
    const t = window.setInterval(() => setBIdx((i) => (i + 1) % banners.length), 6000);
    return () => window.clearInterval(t);
  }, [banners.length]);

  async function copyCoupon(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setToast(`Kupon kodu kopyalandı: ${code}`);
    } catch {
      setToast(`Kupon kodu: ${code} — sepette girebilirsin`);
    }
    window.setTimeout(() => setToast(null), 1800);
  }

  const inStock = (p: Product) => !(p.stockQty != null && p.stockQty <= 0);

  // Vitrin rafları (yalnız "Tümü" görünümü + arama yokken).
  const deals = useMemo(
    () => products.filter((p) => inStock(p) && p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice),
    [products],
  );
  const featured = useMemo(() => products.filter((p) => p.isFeatured && inStock(p)).slice(0, 12), [products]);
  const frequent = useMemo(
    () => frequentSlugs.map((s) => products.find((p) => p.slug === s)).filter((p): p is Product => !!p && inStock(p)),
    [frequentSlugs, products],
  );
  const newArrivals = useMemo(() => {
    const cutoff = Date.now() - NEW_WINDOW_DAYS * 86_400_000;
    return products
      .filter((p) => inStock(p) && new Date(p.createdAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [products]);

  // "Tümü" görünümünde ürünler kategoriye göre gruplanır (karışık değil).
  const grouped = useMemo(() => {
    const byCat = categories.map((c) => ({ cat: c, items: products.filter((p) => p.category?.slug === c.slug) }));
    const orphans = products.filter((p) => !p.category || !categories.some((c) => c.slug === p.category!.slug));
    if (orphans.length) byCat.push({ cat: { slug: '__other', name: 'Diğer' }, items: orphans });
    return byCat.filter((g) => g.items.length > 0);
  }, [products, categories]);

  // Tekil kategori / favori / arama görünümünde düz ızgara.
  const flat = useMemo(() => {
    return products.filter((p) => {
      if (cat === 'favs') { if (!favs.includes(p.slug)) return false; }
      else if (cat !== 'all' && p.category?.slug !== cat) return false;
      if (q && !p.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))) return false;
      return true;
    });
  }, [products, cat, q, favs]);

  function addBasket(b: Basket) {
    add({ slug: b.slug, name: b.name, unitPrice: b.price, unitLabel: b.unitLabel ?? 'paket', emoji: '🧺' });
    flash(b.name);
  }

  if (loading) return <div className="loading">Yükleniyor…</div>;
  if (error)
    return <div className="error" style={{ marginTop: 24 }}>Ürünler yüklenemedi: {error}<br />Sunucu çalışıyor mu? (apps/api)</div>;

  const showcase = cat === 'all' && !q; // raflar + gruplu ızgara
  const banner = banners.length ? banners[bIdx % banners.length] : null;
  const Rail = ({ title, icon, list }: { title: string; icon: string; list: Product[] }) =>
    list.length === 0 ? null : (
      <>
        <div className="sectit"><h2 className="serif">{icon} {title}</h2></div>
        <div className="rail">{list.map((p) => <ProductCard key={p.slug} product={p} onAdded={flash} />)}</div>
      </>
    );

  return (
    <>
      <Suspense fallback={null}><KategoriReader onCat={setCat} /></Suspense>
      {toast && <div className="toast">{toast}</div>}
      <div className="promo">
        <svg className="promo-motif" viewBox="0 0 200 160" aria-hidden="true">
          <circle cx="150" cy="96" r="46" fill="#ffffff" opacity="0.07" />
          <circle cx="120" cy="128" r="30" fill="#ffffff" opacity="0.06" />
          {/* portakal + yaprak */}
          <circle cx="150" cy="98" r="34" fill="#f4a03c" />
          <circle cx="139" cy="86" r="9" fill="#fff" opacity="0.18" />
          <path d="M150 64c2-14 12-22 26-23-1 14-11 22-26 23z" fill="#5aa564" />
          <path d="M150 64c2-14 12-22 26-23" stroke="#4a8f53" strokeWidth="1.5" fill="none" />
          {/* çilek */}
          <path d="M96 118c-9 0-15-6-15-13 0-4 4-6 8-6h14c4 0 8 2 8 6 0 7-6 13-15 13z" fill="#e4572e" />
          <path d="M92 99h16l-3-6h-10z" fill="#5aa564" />
          <g fill="#fff" opacity="0.5"><circle cx="92" cy="106" r="1" /><circle cx="100" cy="110" r="1" /><circle cx="108" cy="106" r="1" /><circle cx="96" cy="114" r="1" /><circle cx="104" cy="114" r="1" /></g>
        </svg>
        <div className="k">{banner?.kicker ?? 'Taze · Yöresel'}</div>
        <div className="t serif">{banner?.title ?? 'Dalından sofrana, özenle'}</div>
        <div className="s">{banner?.subtitle ?? 'Sabah toplanan ürünler, ertesi gün kapında.'}</div>
        {banner?.couponCode && (
          <button className="promo-coupon" onClick={() => copyCoupon(banner.couponCode!)} title="Kodu kopyala">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="tag" size={16} /> {banner.couponCode} <span className="cp">kopyala</span></span>
          </button>
        )}
        {banners.length > 1 && (
          <div className="promo-dots">
            {banners.map((b, i) => (
              <button key={b.id} className={`pd ${i === bIdx % banners.length ? 'on' : ''}`} onClick={() => setBIdx(i)} aria-label={`Banner ${i + 1}`} />
            ))}
          </div>
        )}
      </div>

      <div className="cats">
        <button className={`cat ${cat === 'all' ? 'sel' : ''}`} onClick={() => setCat('all')}>
          <span className="ring">🛒</span>Tümü
        </button>
        {categories.map((c) => (
          <button key={c.slug} className={`cat ${cat === c.slug ? 'sel' : ''}`} onClick={() => setCat(c.slug)}>
            <span className="ring">{CAT_ICON[c.slug] ?? '🧺'}</span>
            {c.name}
          </button>
        ))}
        {favs.length > 0 && (
          <button className={`cat ${cat === 'favs' ? 'sel' : ''}`} onClick={() => setCat('favs')}>
            <span className="ring">❤️</span>Favorilerim
          </button>
        )}
      </div>

      <input className="search" placeholder="Domates, çilek, zeytin…" value={q} onChange={(e) => setQ(e.target.value)} />

      {showcase ? (
        <>
          <Rail title="Sık Aldıkların" icon="🔁" list={frequent} />
          <Rail title="Bu haftanın fırsatları" icon="🔥" list={deals} />
          <Rail title="Öne çıkanlar" icon="⭐" list={featured} />
          <Rail title="Yeni gelenler" icon="🆕" list={newArrivals} />

          {baskets.length > 0 && (
            <>
              <div className="sectit"><h2 className="serif"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="basket" size={16} /> Hazır sepetler</span></h2></div>
              <div className="rail">
                {baskets.map((b) => {
                  const discounted = b.discountedPrice != null && b.discountedPrice > 0 && b.discountedPrice < b.basePrice;
                  return (
                    <div className="prod" key={b.slug}>
                      {discounted && <span className="pill disc">%{Math.round((1 - b.price / b.basePrice) * 100)} İNDİRİM</span>}
                      <div className="ph">
                        {b.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.imageUrl} alt={b.name} loading="lazy" />
                        ) : <Icon name="basket" size={40} />}
                      </div>
                      <div className="nm">{b.name}</div>
                      <div className="or">{b.components.length} çeşit ürün</div>
                      <div className="foot">
                        <div>
                          <div className="pr">{tl(b.price)} <span className="unit">/paket</span></div>
                          {discounted && <s style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{tl(b.basePrice)}</s>}
                        </div>
                        <button className="add" onClick={() => addBasket(b)} aria-label="Sepete ekle">+</button>
                      </div>
                      {inCart(b.slug) > 0 && <div className="incart"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="cart" size={14} /> {inCart(b.slug)} paket sepette</span></div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Tüm ürünler — kategoriye göre gruplu */}
          {grouped.map((g) => (
            <div className="catgroup" key={g.cat.slug}>
              <h3>{CAT_ICON[g.cat.slug] ?? '🧺'} {g.cat.name} <span className="cnt">{g.items.length}</span></h3>
              <div className="grid">
                {g.items.map((p) => <ProductCard key={p.slug} product={p} onAdded={flash} />)}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="sectit">
            <h2 className="serif">{cat === 'favs' ? 'Favorilerim' : q ? `“${q}” için sonuçlar` : categories.find((c) => c.slug === cat)?.name}</h2>
          </div>
          {flat.length === 0 ? (
            cat === 'favs' ? (
              <div className="empty"><div className="big"><Icon name="star" size={44} /></div><h2 className="serif">Henüz favorin yok</h2><div>Ürün kartlarındaki kalbe dokunarak favorilerine ekle.</div></div>
            ) : (
              <div className="empty"><div className="big"><Icon name="basket" size={44} /></div><h2 className="serif">Ürün bulunamadı</h2><div>Farklı bir kategori ya da arama dene.</div></div>
            )
          ) : (
            <div className="grid">
              {flat.map((p) => <ProductCard key={p.slug} product={p} onAdded={flash} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
