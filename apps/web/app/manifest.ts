import type { MetadataRoute } from 'next';

/** PWA manifest — "ana ekrana ekle" ile uygulama gibi açılır. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KabzıMall — Taze ürünler kapında',
    short_name: 'KabzıMall',
    description: 'Taze meyve-sebze ve Antakya yöresel lezzetleri; kapıda ödeme ile kapına gelir.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F1E7',
    theme_color: '#1F4D38',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
