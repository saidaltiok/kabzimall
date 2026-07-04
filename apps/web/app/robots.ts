import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Kişiye özel/işlemsel sayfalar indekslenmez.
      disallow: ['/sepet', '/odeme', '/siparis/', '/siparislerim'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
