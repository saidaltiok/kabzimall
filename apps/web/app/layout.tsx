import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/lib/cart';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'KabzıMall — Taze ürünler kapında', template: '%s | KabzıMall' },
  description: 'Halden her sabah özenle seçilen taze meyve-sebze ve Antakya yöresel lezzetleri; kapıda ödeme ile güvenle kapına gelir.',
  openGraph: {
    siteName: 'KabzıMall',
    type: 'website',
    locale: 'tr_TR',
    title: 'KabzıMall — Taze ürünler kapında',
    description: 'Taze meyve-sebze ve yöresel ürünler; özenle seçilir, güvenle teslim edilir.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F4D38',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <CartProvider>
          <Header />
          <main className="wrap">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
