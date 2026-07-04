import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

/** Statik sayfalar + yayındaki tüm ürünler. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    '', '/hakkimizda', '/iletisim', '/iade', '/mesafeli-satis', '/gizlilik', '/kvkk',
  ].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: p === '' ? 'daily' : 'monthly', priority: p === '' ? 1 : 0.4 }));

  try {
    const r = await fetch(`${API_BASE}/storefront/products`, { next: { revalidate: 3600 } });
    const j = (await r.json()) as { data: { slug: string }[] };
    const products: MetadataRoute.Sitemap = j.data.map((p) => ({
      url: `${SITE_URL}/urun/${p.slug}`,
      changeFrequency: 'daily',
      priority: 0.8,
    }));
    return [...staticPages, ...products];
  } catch {
    return staticPages; // API kapalıysa en azından statik sayfalar
  }
}
