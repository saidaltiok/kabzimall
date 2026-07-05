import type { Metadata } from 'next';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'Sıkça Sorulan Sorular' };

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Nasıl ödeme yapıyorum?',
    a: 'Şimdilik yalnızca kapıda ödeme var: teslimatta nakit ya da kart ile ödersiniz. Sitede kart bilgisi girilmez, ön tahsilat yapılmaz.',
  },
  {
    q: 'Sipariş verirken üye olmam gerekiyor mu?',
    a: 'Hayır. Ad, telefon ve adresle üyeliksiz sipariş verebilirsiniz. E-postanızla giriş yaparsanız (şifresiz, e-postanıza gelen tek kullanımlık kodla) siparişlerinizi her cihazdan takip edebilirsiniz.',
  },
  {
    q: 'Sepette gördüğüm tutar neden "yaklaşık"?',
    a: 'Tartılı ürünlerde (kg ile satılan meyve-sebze) kesin tutar, siparişiniz paketlenirken gerçek gramajla hesaplanır. Kesinleşen tutarı sipariş takip sayfanızda görürsünüz ve kapıda yalnızca onu ödersiniz — sürpriz yok.',
  },
  {
    q: 'Bir ürün stokta yoksa ne oluyor?',
    a: 'Sipariş verirken tercihinizi seçersiniz: ya sizi arayıp muadilini öneririz ya da ürünü çıkarır, tutarı düşeriz. Tercihinize uyulur.',
  },
  {
    q: 'Hangi bölgelere, hangi saatlerde teslimat var?',
    a: 'Pilot bölgemiz Kadıköy ve çevresi; adresinizi girdiğinizde bölge kontrol edilir. Teslimat saat aralıklarını ödeme adımında görür, size uyanı seçersiniz. Sipariş hazırlanmaya başlamadan saat değişikliği talep edebilirsiniz.',
  },
  {
    q: 'Teslimat ücreti ne kadar?',
    a: 'Sepet ara toplamınıza göre kademeli: belirli tutarın üzeri ücretsizdir, altında kalan siparişlerde ücret sipariş özetinde açıkça gösterilir. Gizli ücret yoktur.',
  },
  {
    q: 'Beğenmediğim ürünü iade edebilir miyim?',
    a: 'Evet — kapıda, kurye yanındayken kontrol edin; beğenmediğiniz taze ürünü teslim almayın, bedeli tahsil edilmez. Sonradan fark ettiğiniz sorunlar için aynı gün sipariş kodunuzla bize ulaşın, değiştirir ya da bedelini iade ederiz.',
  },
  {
    q: 'Kupon kodunu nerede kullanıyorum?',
    a: 'Sepet sayfasındaki "Kupon kodu" alanına yazıp Uygula deyin. İndirim sipariş özetinde ayrı satır olarak görünür. Kuponların asgari sepet tutarı ve son kullanma tarihi olabilir; koşul sağlanmıyorsa nedeni açıkça yazılır.',
  },
  {
    q: 'Siparişimi nasıl takip ederim?',
    a: 'Sipariş sonrası verilen kodla sipariş sayfanızı açabilirsiniz; giriş yaptıysanız "Siparişlerim" sayfasında tüm geçmişiniz durur. Hazırlanıyor → yolda → teslim edildi adımlarını oradan izlersiniz.',
  },
  {
    q: 'Ürünler gerçekten halden mi geliyor?',
    a: 'Evet. Ürünler sabah halden alınır, aynı gün paketlenip dağıtılır. Fiyatlarımızı da güncel hal fiyatlarına göre belirliyoruz.',
  },
];

export default function SssPage() {
  return (
    <Legal title="Sıkça Sorulan Sorular" updated="Temmuz 2026">
      {FAQ.map((f) => (
        <details key={f.q} style={{ borderBottom: '1px solid rgba(0,0,0,.08)', padding: '4px 0' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '10px 0', listStylePosition: 'inside' }}>{f.q}</summary>
          <p style={{ marginTop: 0, paddingLeft: 22 }}>{f.a}</p>
        </details>
      ))}
      <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>
        Sorunuzun yanıtı burada yoksa <a href="/iletisim">İletişim</a> sayfasından bize ulaşın.
      </p>
    </Legal>
  );
}
