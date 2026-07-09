'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { customerSession } from '@/lib/api';
import Icon from './Icon';

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
  // Müşteri oturumu (e-posta OTP) — giriş/çıkışta 'km-session' olayıyla anında tazelenir.
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setEmail(customerSession()?.email ?? null);
    read();
    window.addEventListener('km-session', read);
    window.addEventListener('storage', read); // başka sekmede giriş/çıkış
    return () => {
      window.removeEventListener('km-session', read);
      window.removeEventListener('storage', read);
    };
  }, []);

  const isActive = (href: string) =>
    href === '/' ? path === '/' : path === href.split('?')[0] && href !== '/?kategori=yoresel';

  /** "ayse@ornek.com" → "ayse" (header'da kısa görünüm). */
  const shortName = email ? email.split('@')[0] : null;

  return (
    <header className="hdr">
      <div className="in">
        <Link href="/" className="bm serif" onClick={() => setOpen(false)}>
          Kabzı<b>Mall</b>
        </Link>
        <div className="loc" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="mappin" size={15} /> Teslimat · <b>Moda, Kadıköy</b>
        </div>

        {/* Masaüstü menü */}
        <nav className="topnav">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={isActive(href) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>

        <div className="spacer" />
        {email && <Link href="/adreslerim" className="hdr-orders" title="Kayıtlı teslimat adreslerin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="mappin" size={15} /> Adreslerim</Link>}
        <Link href="/siparislerim" className="hdr-orders" title={email ? `${email} — siparişlerin ve çıkış` : 'E-postana gelen kodla giriş yap'}>
          {email ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="user" size={15} /> {shortName} · Siparişlerim</span> : <>Giriş yap · Siparişlerim</>}
        </Link>
        <Link href="/sepet" onClick={() => setOpen(false)}>
          <button className="cartbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="cart" size={15} /> Sepet
            {items.length > 0 && <span className="dot">{items.length}</span>}
          </button>
        </Link>

        {/* Mobil hamburger */}
        <button className="burger" aria-label="Menü" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <Icon name="x" size={16} /> : <Icon name="menu" size={16} />}
        </button>
      </div>

      {/* Mobil açılır menü */}
      {open && (
        <nav className="mobilenav" onClick={() => setOpen(false)}>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
          {email && <Link href="/adreslerim" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="mappin" size={15} /> Adreslerim</Link>}
          <Link href="/siparislerim">{email ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="user" size={15} /> {shortName} · Siparişlerim</span> : 'Giriş yap · Siparişlerim'}</Link>
        </nav>
      )}
    </header>
  );
}
