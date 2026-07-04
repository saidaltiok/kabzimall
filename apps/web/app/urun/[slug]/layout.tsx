import type { Metadata } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

/**
 * Ürün sayfası SEO'su: her ürün kendi başlığı/açıklaması/OG kartıyla indekslenir
 * (sayfanın kendisi client bileşen — meta burada, sunucuda üretilir).
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const p = (await fetch(`${API_BASE}/storefront/products/${slug}`, { next: { revalidate: 300 } }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })) as { name: string; basePrice: number; discountedPrice: number | null; unitLabel: string | null; originRegion: string | null; imageUrl: string | null };
    const price = ((p.discountedPrice ?? p.basePrice) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    const desc = `${p.name} — ${price} ₺${p.unitLabel ? ` / ${p.unitLabel}` : ''}.` +
      (p.originRegion ? ` Menşei: ${p.originRegion}.` : '') +
      ' Kapıda ödeme ile taze teslim.';
    return {
      title: p.name,
      description: desc,
      openGraph: { title: `${p.name} | KabzıMall`, description: desc, ...(p.imageUrl ? { images: [p.imageUrl] } : {}) },
    };
  } catch {
    return { title: 'Ürün', description: 'KabzıMall taze ürünler.' };
  }
}

export default function UrunLayout({ children }: { children: React.ReactNode }) {
  return children;
}
