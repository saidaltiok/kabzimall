'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { getToken } from '@/lib/auth';

/** Giriş kapısı + uygulama iskeleti. /login dışındaki sayfalar token ister. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (path === '/login') {
      setReady(true);
      return;
    }
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [path, router]);

  if (path === '/login') return <>{children}</>;
  if (!ready) return null;
  // Kurye görünümü: auth korumalı ama sidebar'sız, tam ekran mobil.
  if (path.startsWith('/kurye')) return <>{children}</>;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">{children}</div>
    </div>
  );
}
