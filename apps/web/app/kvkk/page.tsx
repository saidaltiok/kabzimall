import type { Metadata } from 'next';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'KVKK Aydınlatma Metni' };

export default function KvkkPage() {
  return (
    <Legal title="KVKK Aydınlatma Metni" updated="Temmuz 2026">
      <p className="doldur">
        ⚠️ Yayına almadan önce doldurulacak: veri sorumlusunun ticari unvanı, adresi, MERSİS/VKN
        ve başvuru e-posta adresi. Bu metin şablondur; nihai hâli için hukuk danışmanına
        onaylatılması önerilir.
      </p>

      <h2>1. Veri Sorumlusu</h2>
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca kişisel verileriniz,
        veri sorumlusu sıfatıyla <b>[Şirket Unvanı]</b> (&quot;KabzıMall&quot;) tarafından aşağıda açıklanan
        kapsamda işlenmektedir.
      </p>

      <h2>2. İşlenen Kişisel Veriler</h2>
      <ul>
        <li><b>Kimlik ve iletişim:</b> ad-soyad, telefon numarası, e-posta adresi (isteğe bağlı).</li>
        <li><b>Teslimat:</b> adres metni, ilçe ve — siz haritada işaretlerseniz — teslimat noktası konumu (enlem/boylam).</li>
        <li><b>Sipariş:</b> sipariş içeriği, tutarları, tercihler (ör. ürün eksik çıkarsa davranışı), sipariş geçmişi.</li>
        <li><b>İşlem güvenliği:</b> giriş doğrulama kodları (özetlenmiş/hash), oturum bilgisi, IP tabanlı istek sınırlama kayıtları.</li>
      </ul>

      <h2>3. İşleme Amaçları ve Hukuki Sebepler</h2>
      <ul>
        <li>Siparişinizin alınması, hazırlanması ve teslim edilmesi (KVKK m.5/2-c: sözleşmenin kurulması ve ifası).</li>
        <li>Sipariş durumu hakkında bilgilendirme (onay, hazırlanıyor, yolda, teslim; teslimat saati değişikliği kararları).</li>
        <li>Teslimatın doğru adrese yapılabilmesi için konum bilgisinin kurye rotasında kullanılması.</li>
        <li>Hesap girişinin tek kullanımlık e-posta koduyla doğrulanması ve kötüye kullanımın önlenmesi (m.5/2-f: meşru menfaat).</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi (m.5/2-ç).</li>
      </ul>

      <h2>4. Aktarım</h2>
      <p>
        Verileriniz yalnızca teslimatın gerçekleştirilmesi amacıyla kurye personeliyle (ad, adres,
        konum, telefon) ve e-posta bildirimleri için e-posta gönderim hizmet sağlayıcısıyla
        paylaşılır; bunun dışında üçüncü kişilere satılmaz ve pazarlama amacıyla aktarılmaz.
      </p>

      <h2>5. Saklama Süresi</h2>
      <p>
        Sipariş kayıtları, ilgili mevzuattaki (ör. vergi ve tüketici mevzuatı) zamanaşımı süreleri
        boyunca saklanır. Tek kullanımlık giriş kodları 5 dakika içinde geçersizleşir ve düz metin
        olarak hiç saklanmaz.
      </p>

      <h2>6. KVKK m.11 Kapsamındaki Haklarınız</h2>
      <p>
        Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltme, silinmesini
        isteme, aktarıldığı üçüncü kişileri bilme, otomatik sistemlerce analiz sonucuna itiraz ve
        zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı{' '}
        <b>[başvuru e-posta adresi]</b> üzerinden ya da İletişim sayfamızdaki kanallardan iletebilirsiniz;
        başvurular en geç 30 gün içinde yanıtlanır.
      </p>
    </Legal>
  );
}
