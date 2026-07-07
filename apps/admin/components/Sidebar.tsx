'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 9 giriş, 2 grup. İlgili ekranlar tek girişte toplanır; grup içi gezinme
 * ekranların üstündeki SectionTabs ile (URL'ler değişmedi — `also` o ekranlarda
 * da girişi aktif vurgular).
 */
const SECTIONS: { label: string; links: { href: string; icon: string; label: string; also?: string[] }[] }[] = [
  {
    label: 'Günlük İş',
    links: [
      { href: '/', icon: '☀️', label: 'Bugün' },
      { href: '/hal', icon: '🧺', label: 'Piyasa Verisi', also: ['/rakip'] },
      { href: '/oner', icon: '🎯', label: 'Fiyatlandırma', also: ['/matris', '/yayinla', '/urunler', '/senaryo', '/otomatik-indirim'] },
      { href: '/siparisler', icon: '🧾', label: 'Siparişler' },
      { href: '/tezgah', icon: '🛒', label: 'Tezgâh Satışı' },
      { href: '/kasa', icon: '💰', label: 'Kasa' },
      { href: '/rota', icon: '🚚', label: 'Dağıtım Rotası' },
    ],
  },
  {
    label: 'Yönetim',
    links: [
      { href: '/katalog', icon: '🗂️', label: 'Ürünler', also: ['/sepetler', '/stok'] },
      { href: '/satis', icon: '📈', label: 'Satış Analizi' },
      { href: '/musteriler', icon: '👥', label: 'Müşteriler', also: ['/destek'] },
      { href: '/maliyet', icon: '💸', label: 'Maliyet & Kurallar', also: ['/maliyet-tablo', '/kurallar', '/finans'] },
      { href: '/ayarlar', icon: '⚙️', label: 'Ayarlar', also: ['/bolgeler', '/kuponlar', '/bannerlar', '/kullanicilar'] },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="side">
      <div className="logo">
        <div className="leaf">🌿</div>
        <div>
          <div className="bm">
            Kabzı<b>Mall</b>
          </div>
          <div className="sub">Intelligence</div>
        </div>
      </div>
      {SECTIONS.map((s) => (
        <div key={s.label}>
          <div className="navlabel">{s.label}</div>
          <nav className="nav">
            {s.links.map((l) => (
              <Link key={l.href} href={l.href} className={path === l.href || l.also?.includes(path) ? 'active' : ''}>
                <span className="ic">{l.icon}</span> {l.label}
              </Link>
            ))}
          </nav>
        </div>
      ))}
      <div className="foot">
        Pilot bölge: Kadıköy
        <br />
        Tek kaynak: packages/pricing
      </div>
    </aside>
  );
}
