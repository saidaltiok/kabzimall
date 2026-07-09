'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from './Icon';

export interface SectionTab { href: string; label: string; icon?: IconName }

/* Ekran grupları — sidebar 9 girişe iner, ilgili ekranlar grup içi sekmeyle gezilir. */
export const MARKET_TABS: SectionTab[] = [
  { href: '/hal', label: 'Hal fiyatları', icon: 'leaf' },
  { href: '/hal-alim', label: 'Hal alımı (fatura)', icon: 'receipt' },
  { href: '/rakip', label: 'Rakip fiyatları', icon: 'tag' },
];
// Fiyat matrisi toplu yayın + marj görünümünü kapsadığı için "Toplu yayına al"
// ve "Marj tablosu" sekmeden kaldırıldı (rotalar erişilebilir kalır; menü sadeleşir).
export const PRICING_TABS: SectionTab[] = [
  { href: '/kokpit', label: 'Fiyat kokpiti', icon: 'sliders' },
  { href: '/matris', label: 'Fiyat matrisi', icon: 'grid' },
  { href: '/oner', label: 'Tek ürün fiyatla', icon: 'target' },
  { href: '/senaryo', label: 'Senaryo', icon: 'star' },
  { href: '/otomatik-indirim', label: 'Oto. indirim', icon: 'tag' },
];
export const PRODUCTS_TABS: SectionTab[] = [
  { href: '/katalog', label: 'Katalog', icon: 'folder' },
  { href: '/sepetler', label: 'Hazır sepetler', icon: 'basket' },
  { href: '/stok', label: 'Stok hareketleri', icon: 'box' },
];
export const COST_TABS: SectionTab[] = [
  { href: '/maliyet', label: 'Maliyet & Fire', icon: 'coins' },
  { href: '/maliyet-tablo', label: 'Maliyet tablosu', icon: 'receipt' },
  { href: '/kurallar', label: 'Fiyat kuralları', icon: 'sliders' },
  { href: '/finans', label: 'Finans (gider & K/Z)', icon: 'chart' },
];
export const CUSTOMERS_TABS: SectionTab[] = [
  { href: '/musteriler', label: 'Müşteriler', icon: 'users' },
  { href: '/destek', label: 'Destek', icon: 'headset' },
];
export const SETTINGS_TABS: SectionTab[] = [
  { href: '/ayarlar', label: 'Mağaza', icon: 'settings' },
  { href: '/bolgeler', label: 'Teslimat bölgeleri', icon: 'mappin' },
  { href: '/kuponlar', label: 'Kuponlar', icon: 'tag' },
  { href: '/bannerlar', label: 'Banner', icon: 'image' },
  { href: '/kullanicilar', label: 'Kullanıcılar', icon: 'user' },
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
          style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {t.icon && <Icon name={t.icon} size={15} />}
          {t.label}
        </Link>
      ))}
    </div>
  );
}
