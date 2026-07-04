'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface Contact {
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  contactInstagram: string | null;
}

/** Site alt bilgisi: iletişim (Mağaza Ayarları'ndan) + kurumsal/yasal bağlantılar. */
export default function Footer() {
  const [c, setC] = useState<Contact | null>(null);
  useEffect(() => {
    apiGet<Contact>('/storefront/settings').then(setC).catch(() => {});
  }, []);

  return (
    <footer style={{ background: 'var(--forest, #1F4D38)', color: '#F6F1E7', marginTop: 48 }}>
      <div className="wrap" style={{ padding: '34px 20px 26px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 26 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700 }}>Kabzı<span style={{ color: 'var(--persimmon, #E8703A)' }}>Mall</span></div>
          <p style={{ fontSize: 13, opacity: 0.85, marginTop: 8, lineHeight: 1.55 }}>
            Halden her sabah özenle seçilen taze meyve-sebze ve Antakya&apos;dan yöresel lezzetler, kapına gelsin.
          </p>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, opacity: 0.95 }}>Alışveriş</div>
          {[['/', 'Tüm ürünler'], ['/?kategori=yoresel', 'Yöresel Ürünler'], ['/sepet', 'Sepetim'], ['/siparislerim', 'Siparişlerim']].map(([href, label]) => (
            <div key={href} style={{ marginBottom: 6 }}><Link href={href} style={{ color: '#F6F1E7', opacity: 0.8, fontSize: 13, textDecoration: 'none' }}>{label}</Link></div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, opacity: 0.95 }}>Kurumsal</div>
          {[['/hakkimizda', 'Hakkımızda'], ['/iletisim', 'İletişim'], ['/iade', 'İade & Teslimat'], ['/mesafeli-satis', 'Mesafeli Satış Sözleşmesi'], ['/gizlilik', 'Gizlilik & Çerezler'], ['/kvkk', 'KVKK Aydınlatma Metni'], ['/kaynaklar', 'Görsel Kaynakları']].map(([href, label]) => (
            <div key={href} style={{ marginBottom: 6 }}><Link href={href} style={{ color: '#F6F1E7', opacity: 0.8, fontSize: 13, textDecoration: 'none' }}>{label}</Link></div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, opacity: 0.95 }}>İletişim</div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.9 }}>
            {c?.contactAddress && <div>📍 {c.contactAddress}</div>}
            {c?.contactPhone && <div>📞 <a href={`tel:${c.contactPhone.replace(/\s/g, '')}`} style={{ color: '#F6F1E7' }}>{c.contactPhone}</a></div>}
            {c?.contactWhatsapp && <div>💬 <a href={`https://wa.me/${c.contactWhatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ color: '#F6F1E7' }}>WhatsApp</a></div>}
            {c?.contactEmail && <div>✉️ <a href={`mailto:${c.contactEmail}`} style={{ color: '#F6F1E7' }}>{c.contactEmail}</a></div>}
            {c?.contactInstagram && <div>📷 <a href={`https://instagram.com/${c.contactInstagram.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ color: '#F6F1E7' }}>{c.contactInstagram}</a></div>}
            {!c?.contactPhone && !c?.contactAddress && <div style={{ opacity: 0.6 }}>İletişim bilgileri yakında.</div>}
          </div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(246,241,231,.15)', padding: '14px 20px', textAlign: 'center', fontSize: 12, opacity: 0.7 }}>
        © {new Date().getFullYear()} KabzıMall · Kapıda ödeme ile güvenli alışveriş · Tüm hakları saklıdır
      </div>
    </footer>
  );
}
