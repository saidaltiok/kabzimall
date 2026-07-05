import type { Metadata } from 'next';
import SupportForm from '@/components/SupportForm';

export const metadata: Metadata = {
  title: 'İletişim',
  description: 'KabzıMall iletişim: telefon, WhatsApp, e-posta ve adres bilgileri.',
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

interface Contact {
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  contactInstagram: string | null;
}

/** Sunucu bileşeni: iletişim bilgileri Mağaza Ayarları'ndan gelir (panelden düzenlenir). */
export default async function IletisimPage() {
  let c: Contact | null = null;
  try {
    c = await fetch(`${API_BASE}/storefront/settings`, { cache: 'no-store' }).then((r) => r.json());
  } catch {
    /* API kapalıysa sayfa yine açılır */
  }

  const Row = ({ icon, label, value, href }: { icon: string; label: string; value: string; href?: string }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0', borderBottom: '1px solid var(--line, #e2ded4)' }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--muted, #7c7667)' }}>{label}</div>
        {href ? (
          <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ fontWeight: 600, color: 'var(--forest, #1F4D38)' }}>{value}</a>
        ) : (
          <div style={{ fontWeight: 600 }}>{value}</div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '30px 0' }}>
      <h1 className="h1">İletişim</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 18, fontSize: 14 }}>
        Siparişiniz, ürünlerimiz ya da işbirliği için bize her kanaldan ulaşabilirsiniz.
      </p>
      <div className="block">
        {c?.contactPhone && <Row icon="📞" label="Telefon" value={c.contactPhone} href={`tel:${c.contactPhone.replace(/\s/g, '')}`} />}
        {c?.contactWhatsapp && <Row icon="💬" label="WhatsApp" value={c.contactWhatsapp} href={`https://wa.me/${c.contactWhatsapp.replace(/\D/g, '')}`} />}
        {c?.contactEmail && <Row icon="✉️" label="E-posta" value={c.contactEmail} href={`mailto:${c.contactEmail}`} />}
        {c?.contactInstagram && <Row icon="📷" label="Instagram" value={c.contactInstagram} href={`https://instagram.com/${c.contactInstagram.replace('@', '')}`} />}
        {c?.contactAddress && <Row icon="📍" label="Adres" value={c.contactAddress} />}
        {!c?.contactPhone && !c?.contactAddress && !c?.contactEmail && (
          <p className="muted">İletişim bilgileri henüz girilmedi (Yönetim → Ayarlar → İletişim Bilgileri).</p>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        Sipariş sorunlarında en hızlı çözüm için sipariş kodunuzu (KM…) hazır bulundurun.
        Siparişinizi <a href="/siparislerim" style={{ color: 'var(--forest, #1F4D38)', fontWeight: 600 }}>Siparişlerim</a> sayfasından da takip edebilirsiniz.
      </p>
      <SupportForm />
    </div>
  );
}
