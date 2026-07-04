'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS: { label: string; links: { href: string; icon: string; label: string }[] }[] = [
  {
    label: 'Fiyat Zekâsı',
    links: [
      { href: '/', icon: '☀️', label: 'Bugün' },
      { href: '/hal', icon: '🥬', label: 'Hal Fiyatları' },
      { href: '/rakip', icon: '🏷️', label: 'Rakip Fiyatları' },
      { href: '/yayinla', icon: '🚀', label: 'Yayına Al' },
      { href: '/maliyet', icon: '💸', label: 'Maliyet & Fire' },
      { href: '/oner', icon: '🎯', label: 'Fiyat Öneri Motoru' },
      { href: '/kurallar', icon: '📐', label: 'Fiyat Kuralları' },
      { href: '/senaryo', icon: '🔮', label: 'Senaryo Analizi' },
      { href: '/satis', icon: '📈', label: 'Satış Analizi' },
      { href: '/urunler', icon: '📦', label: 'Ürünler & Marj' },
    ],
  },
  {
    label: 'Operasyon',
    links: [
      { href: '/siparisler', icon: '🧾', label: 'Siparişler' },
      { href: '/rota', icon: '🚚', label: 'Dağıtım Rotası' },
      { href: '/katalog', icon: '🗂️', label: 'Ürün Kataloğu' },
      { href: '/sepetler', icon: '🧺', label: 'Hazır Sepetler' },
      { href: '/bolgeler', icon: '📍', label: 'Teslimat Bölgeleri' },
      { href: '/ayarlar', icon: '⚙️', label: 'Mağaza Ayarları' },
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
              <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
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
