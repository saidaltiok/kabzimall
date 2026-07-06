'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SectionTab { href: string; label: string; icon?: string }

/* Ekran grupları — sidebar 9 girişe iner, ilgili ekranlar grup içi sekmeyle gezilir. */
export const MARKET_TABS: SectionTab[] = [
  { href: '/hal', label: 'Hal fiyatları', icon: '🥬' },
  { href: '/rakip', label: 'Rakip fiyatları', icon: '🏷️' },
];
export const PRICING_TABS: SectionTab[] = [
  { href: '/matris', label: 'Fiyat matrisi', icon: '🧮' },
  { href: '/oner', label: 'Tek ürün fiyatla', icon: '🎯' },
  { href: '/yayinla', label: 'Toplu yayına al', icon: '🚀' },
  { href: '/urunler', label: 'Marj tablosu', icon: '📦' },
  { href: '/senaryo', label: 'Senaryo', icon: '🔮' },
];
export const PRODUCTS_TABS: SectionTab[] = [
  { href: '/katalog', label: 'Katalog', icon: '🗂️' },
  { href: '/sepetler', label: 'Hazır sepetler', icon: '🧺' },
  { href: '/stok', label: 'Stok hareketleri', icon: '📦' },
];
export const COST_TABS: SectionTab[] = [
  { href: '/maliyet', label: 'Maliyet & Fire', icon: '💸' },
  { href: '/kurallar', label: 'Fiyat kuralları', icon: '📐' },
  { href: '/finans', label: 'Finans (gider & K/Z)', icon: '📒' },
];
export const CUSTOMERS_TABS: SectionTab[] = [
  { href: '/musteriler', label: 'Müşteriler', icon: '👥' },
  { href: '/destek', label: 'Destek', icon: '🎧' },
];
export const SETTINGS_TABS: SectionTab[] = [
  { href: '/ayarlar', label: 'Mağaza', icon: '⚙️' },
  { href: '/bolgeler', label: 'Teslimat bölgeleri', icon: '📍' },
  { href: '/kuponlar', label: 'Kuponlar', icon: '🎟️' },
  { href: '/bannerlar', label: 'Banner', icon: '🖼️' },
  { href: '/kullanicilar', label: 'Kullanıcılar', icon: '👤' },
];

/** Grup içi sekme gezinmesi (ör. Piyasa Verisi: Hal | Rakip). URL'ler değişmez. */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const path = usePathname();
  return (
    <div className="pchips" style={{ marginBottom: 14 }}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`pchip${path === t.href ? ' sel' : ''}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          {t.icon && <span className="e">{t.icon}</span>}
          {t.label}
        </Link>
      ))}
    </div>
  );
}
