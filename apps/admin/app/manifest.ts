import type { MetadataRoute } from 'next';

/** PWA manifest — kurye "ana ekrana ekle" ile app gibi açsın. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KabzıMall Kurye',
    short_name: 'Kurye',
    start_url: '/kurye',
    display: 'standalone',
    background_color: '#F6F1E7',
    theme_color: '#1F4D38',
    icons: [{ src: '/kurye-icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
