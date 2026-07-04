import type { Metadata } from 'next';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'Mesafeli Satış Sözleşmesi' };

export default function MesafeliSatisPage() {
  return (
    <Legal title="Mesafeli Satış Sözleşmesi" updated="Temmuz 2026">
      <p className="doldur">
        ⚠️ Yayına almadan önce doldurulacak: SATICI unvanı, adresi, MERSİS/VKN, telefon.
        Bu metin 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği&apos;ne göre hazırlanmış
        şablondur; nihai hâli hukuk danışmanına onaylatılmalıdır.
      </p>

      <h2>1. Taraflar</h2>
      <p>
        <b>SATICI:</b> [Şirket Unvanı], [Adres], [MERSİS/VKN] (&quot;KabzıMall&quot;).<br />
        <b>ALICI:</b> Sipariş formunda ad-soyad, telefon ve teslimat adresi bilgilerini veren tüketici.
      </p>

      <h2>2. Konu</h2>
      <p>
        İşbu sözleşme, ALICI&apos;nın KabzıMall internet sitesi üzerinden elektronik ortamda sipariş
        verdiği ürünlerin satışı ve teslimi ile ilgili olarak tarafların hak ve yükümlülüklerini düzenler.
      </p>

      <h2>3. Ürünler ve Fiyat</h2>
      <ul>
        <li>Ürünler ve satış fiyatları sipariş özetinde gösterildiği gibidir; fiyatlara KDV dâhildir.</li>
        <li><b>Tartılı ürünlerde</b> (kg ile satılan meyve-sebze) sipariş anındaki tutar tahminidir; kesin
          tutar, paketleme sırasında yapılan gerçek tartım üzerinden hesaplanır ve sipariş sayfanızda
          &quot;kesinleşen tutar&quot; olarak gösterilir. Kesinleşen tutar yalnız gramaj farkından kaynaklanır.</li>
        <li>Teslimat ücreti, sipariş özetinde ayrıca gösterilir; belirtilen sepet tutarı üzeri teslimat ücretsizdir.</li>
      </ul>

      <h2>4. Ödeme</h2>
      <p>Ödeme, teslimat anında kapıda nakit ya da banka/kredi kartı ile yapılır (&quot;kapıda ödeme&quot;).</p>

      <h2>5. Teslimat</h2>
      <ul>
        <li>Teslimat, ALICI&apos;nın seçtiği gün ve saat aralığında, bildirdiği adrese yapılır.</li>
        <li>ALICI, sipariş hazırlanmaya başlamadan önce teslimat saatini değiştirmeyi talep edebilir;
          değişiklik SATICI onayıyla kesinleşir ve ALICI bilgilendirilir.</li>
        <li>Sipariş hazırlanırken bir ürünün temin edilememesi hâlinde, ALICI&apos;nın sipariş sırasında
          seçtiği tercihe göre hareket edilir: müşteri aranır, ürün siparişten çıkarılır (bedeli tahsil
          edilmez) ya da benzer taze ürünle değiştirilir.</li>
      </ul>

      <h2>6. Cayma Hakkı ve İstisnası</h2>
      <p>
        Mesafeli Sözleşmeler Yönetmeliği m.15/1-c uyarınca <b>çabuk bozulabilen veya son kullanma
        tarihi geçebilecek malların</b> (taze meyve-sebze ve benzeri gıdalar) teslimine ilişkin
        sözleşmelerde cayma hakkı kullanılamaz. Bununla birlikte KabzıMall, taze ürünlerde
        <b> kapıda kontrol ve kapıda iade</b> imkânı tanır: beğenmediğiniz ürünü teslim almayabilirsiniz;
        bedeli tahsil edilmez. Ayrıntılar için İade &amp; Teslimat Koşulları&apos;na bakınız.
      </p>
      <p>
        Cayma hakkının geçerli olduğu (bozulabilir olmayan) ürünlerde ALICI, teslimden itibaren 14 gün
        içinde gerekçe göstermeksizin cayma hakkına sahiptir.
      </p>

      <h2>7. Uyuşmazlık</h2>
      <p>
        Uyuşmazlıklarda, Ticaret Bakanlığı&apos;nca ilan edilen parasal sınırlar dâhilinde ALICI&apos;nın
        yerleşim yerindeki Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.
      </p>

      <h2>8. Yürürlük</h2>
      <p>ALICI, siparişi onayladığında işbu sözleşmenin tüm koşullarını kabul etmiş sayılır.</p>
    </Legal>
  );
}
