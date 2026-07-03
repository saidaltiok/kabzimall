import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'KabzıMall Kurye',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Kurye' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F4D38',
};

export default function KuryeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
