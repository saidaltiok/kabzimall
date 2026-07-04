'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';

const NAV: [string, string][] = [
  ['/', 'Ürünler'],
  ['/?kategori=yoresel', 'Yöresel'],
  ['/hakkimizda', 'Hakkımızda'],
  ['/iletisim', 'İletişim'],
];

export default function Header() {
  const { items } = useCart();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? path === '/' : path === href.split('?')[0] && href !== '/?kategori=yoresel';

  return (
    <header className="hdr">
      <div className="in">
        <Link href="/" className="bm serif" onClick={() => setOpen(false)}>
          Kabzı<b>Mall</b>
        </Link>
        <div className="loc">
          📍 Teslimat · <b>Moda, Kadıköy</b>
        </div>

        {/* Masaüstü menü */}
        <nav className="topnav">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={isActive(href) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>

        <div className="spacer" />
        <Link href="/siparislerim" className="hdr-orders">Siparişlerim</Link>
        <Link href="/sepet" onClick={() => setOpen(false)}>
          <button className="cartbtn">
            🛒 Sepet
            {items.length > 0 && <span className="dot">{items.length}</span>}
          </button>
        </Link>

        {/* Mobil hamburger */}
        <button className="burger" aria-label="Menü" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobil açılır menü */}
      {open && (
        <nav className="mobilenav" onClick={() => setOpen(false)}>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
          <Link href="/siparislerim">Siparişlerim</Link>
        </nav>
      )}
    </header>
  );
}
