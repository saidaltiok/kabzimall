'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SectionTab { href: string; label: string; icon?: string }

/* Ekran grupları — sidebar 9 girişe iner, ilgili ekranlar grup içi sekmeyle gezilir. */
export const MARKET_TABS: SectionTab[] = [
  { href: '/hal', label: 'Hal fiyatları', icon: '🥬' },
  { href: '/hal-alim', label: 'Hal alımı (fatura)', icon: '🧾' },
  { href: '/rakip', label: 'Rakip fiyatları', icon: '🏷️' },
];
// Fiyat matrisi toplu yayın + marj görünümünü kapsadığı için "Toplu yayına al"
// ve "Marj tablosu" sekmeden kaldırıldı (rotalar erişilebilir kalır; menü sadeleşir).
export const PRICING_TABS: SectionTab[] = [
  { href: '/kokpit', label: 'Fiyat kokpiti', icon: '🎛️' },
  { href: '/matris', label: 'Fiyat matrisi', icon: '🧮' },
  { href: '/oner', label: 'Tek ürün fiyatla', icon: '🎯' },
  { href: '/senaryo', label: 'Senaryo', icon: '🔮' },
  { href: '/otomatik-indirim', label: 'Oto. indirim', icon: '🏷️' },
];
export const PRODUCTS_TABS: SectionTab[] = [
  { href: '/katalog', label: 'Katalog', icon: '🗂️' },
  { href: '/sepetler', label: 'Hazır sepetler', icon: '🧺' },
  { href: '/stok', label: 'Stok hareketleri', icon: '📦' },
];
export const COST_TABS: SectionTab[] = [
  { href: '/maliyet', label: 'Maliyet & Fire', icon: '💸' },
  { href: '/maliyet-tablo', label: 'Maliyet tablosu', icon: '🧾' },
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
