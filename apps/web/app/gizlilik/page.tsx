import type { Metadata } from 'next';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'Gizlilik ve Çerez Politikası' };

export default function GizlilikPage() {
  return (
    <Legal title="Gizlilik ve Çerez Politikası" updated="Temmuz 2026">
      <h2>1. Genel İlke</h2>
      <p>
        KabzıMall, yalnızca siparişinizi almak ve teslim etmek için gereken asgari veriyi toplar.
        Verileriniz reklam amaçlı üçüncü taraflarla paylaşılmaz; sitede üçüncü taraf reklam/takip
        çerezi kullanılmaz.
      </p>

      <h2>2. Tarayıcıda Saklanan Veriler (localStorage)</h2>
      <p>Sitemiz klasik çerez yerine tarayıcınızın yerel depolamasını kullanır ve yalnızca şunları saklar:</p>
      <ul>
        <li><b>Sepetiniz</b> — sayfayı kapatıp açtığınızda sepetin kaybolmaması için.</li>
        <li><b>Bu cihazda verdiğiniz siparişlerin kimlikleri</b> — &quot;Siparişlerim&quot; sayfasının çalışması için.</li>
        <li><b>Giriş yaptıysanız oturum anahtarınız ve e-postanız</b> — tekrar kod girmeden siparişlerinizi görebilmeniz için.</li>
      </ul>
      <p>
        Bu veriler sunucuya reklam amaçlı gönderilmez ve tarayıcı verilerini temizlediğinizde silinir.
        &quot;Çıkış&quot; yaptığınızda oturum bilgileri anında kaldırılır.
      </p>

      <h2>3. Konum Bilgisi</h2>
      <p>
        Ödeme sayfasındaki harita, teslimat noktanızı işaretlemenizi sağlar. Cihaz konumunuz yalnızca
        siz izin verirseniz kullanılır; izin vermezseniz haritadan elle seçim yapabilirsiniz. Seçilen
        nokta yalnızca o siparişin teslimatı ve kurye rotası için kullanılır.
      </p>

      <h2>4. E-posta</h2>
      <p>
        E-posta adresi vermek isteğe bağlıdır. Verirseniz yalnızca sipariş bildirimleri (onay, durum,
        teslimat saati kararı) ve giriş kodu göndermek için kullanılır; pazarlama listelerine eklenmez.
      </p>

      <h2>5. Güvenlik</h2>
      <p>
        Giriş kodları tek kullanımlıktır, 5 dakikada geçersizleşir ve sistemde yalnızca geri
        döndürülemez özet (hash) olarak tutulur. Sipariş sorgulama ve kod isteme uçları, kötüye
        kullanıma karşı istek sınırlamalıdır.
      </p>

      <h2>6. İletişim</h2>
      <p>
        Gizlilikle ilgili sorularınız için <a href="/iletisim" style={{ color: 'var(--forest, #1F4D38)', fontWeight: 600 }}>İletişim</a> sayfamızdaki
        kanalları kullanabilirsiniz. Ayrıntılı bilgi için <a href="/kvkk" style={{ color: 'var(--forest, #1F4D38)', fontWeight: 600 }}>KVKK Aydınlatma Metni</a>ne bakın.
      </p>
    </Legal>
  );
}
