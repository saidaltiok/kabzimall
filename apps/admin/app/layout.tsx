import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'KabzıMall Intelligence',
  description: 'Veriyle fiyat yöneten yönetim paneli',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
