import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/lib/cart';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'KabzıMall — Taze ürünler kapında',
  description: 'Meyve, sebze ve yöresel ürünler; özenle seçilir, güvenle teslim edilir.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <CartProvider>
          <Header />
          <main className="wrap">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
