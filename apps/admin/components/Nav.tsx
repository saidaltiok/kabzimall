'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { API_BASE } from '@/lib/api';

const LINKS = [
  { href: '/', label: 'Panel' },
  { href: '/oner', label: 'Fiyat Öner' },
  { href: '/hal', label: 'Hal Girişi' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="brand">
        Kabzı<span>Mall</span>
      </div>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="spacer" />
      <div className="env">Intelligence · {API_BASE.replace(/^https?:\/\//, '')}</div>
    </header>
  );
}
