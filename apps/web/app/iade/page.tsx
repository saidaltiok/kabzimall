import type { Metadata } from 'next';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'İade ve Teslimat Koşulları' };

export default function IadePage() {
  return (
    <Legal title="İade ve Teslimat Koşulları" updated="Temmuz 2026">
      <h2>Teslimat</h2>
      <ul>
        <li>Siparişler, seçtiğiniz gün ve saat aralığında adresinize teslim edilir.</li>
        <li>Teslimat bölgelerimiz sipariş sayfasında listelenir; bölge dışına şimdilik teslimat yapılmamaktadır.</li>
        <li>Belirtilen sepet tutarının üzerindeki siparişlerde teslimat ücretsizdir; altındaki
          siparişlerde teslimat ücreti sipariş özetinde açıkça gösterilir.</li>
        <li>Tartılı ürünlerde kesin tutar, paketlemede gerçek gramajla hesaplanır — sipariş
          sayfanızda &quot;kesinleşen tutar&quot; olarak görürsünüz ve kapıda yalnızca bunu ödersiniz.</li>
        <li>Sipariş hazırlanmaya başlamadan önce teslimat saatini sipariş sayfanızdan değiştirmeyi
          talep edebilir, siparişinizi iptal edebilirsiniz.</li>
      </ul>

      <h2>Kapıda Kontrol ve İade — Taze Ürün Sözümüz</h2>
      <ul>
        <li>Ürünlerinizi teslimat anında, kurye yanındayken kontrol edebilirsiniz.</li>
        <li>Beğenmediğiniz taze ürünü <b>kapıda iade edebilirsiniz</b>: ürün teslim alınmaz ve
          bedeli tahsil edilmez. Soru sorulmaz.</li>
        <li>Teslim aldıktan sonra fark ettiğiniz bir sorun (ezik, bozuk ürün) için aynı gün içinde
          İletişim kanallarımızdan sipariş kodunuzla ulaşın; ürünü değiştirir ya da bedelini iade ederiz.</li>
      </ul>

      <h2>Cayma Hakkı Hakkında</h2>
      <p>
        Taze meyve-sebze gibi çabuk bozulabilen gıdalar, mevzuat gereği (Mesafeli Sözleşmeler
        Yönetmeliği m.15/1-c) 14 günlük cayma hakkının istisnasıdır — bu yüzden yukarıdaki
        <b> kapıda kontrol/iade</b> imkânını sunuyoruz. Bozulabilir olmayan yöresel ürünlerde
        (ör. kavanoz/şişe ürünler, ambalajı açılmamış olmak kaydıyla) teslimden itibaren 14 gün
        içinde cayma hakkınızı kullanabilirsiniz.
      </p>

      <h2>Bedel İadesi</h2>
      <p>
        Kapıda ödemede bedel tahsil edilmeden iade yapıldığından çoğu durumda para iadesi gerekmez.
        Tahsilat sonrası onaylanan iadelerde bedel, ödeme yönteminize göre nakden ya da karta iade
        edilir.
      </p>
    </Legal>
  );
}
