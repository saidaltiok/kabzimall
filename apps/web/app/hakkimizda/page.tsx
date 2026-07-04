import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Hakkımızda',
  description: 'KabzıMall: halden her sabah özenle seçilen taze meyve-sebze ve Antakya yöresel lezzetleri.',
};

export default function HakkimizdaPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '30px 0' }}>
      <h1 className="h1">Hakkımızda</h1>
      <div style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--ink)' }}>
        <p>
          <b>KabzıMall</b>, işini bilen bir kabzımalın gözüyle çalışan online manavdır. Her sabah
          gün ağarmadan haldeyiz: o günün en iyi ürününü tezgâh tezgâh gezerek seçer, elimizle
          tartar, özenle paketler ve aynı özenle kapınıza getiririz.
        </p>
        <p>
          Fiyatlarımız keyfî değildir — hal fiyatını, maliyeti ve piyasayı her gün veriyle takip
          eder, dürüst fiyat çıkarırız. Tartılı ürünlerde tutar, gerçek gramaj üzerinden paketleme
          sırasında kesinleşir; asla fazlasını ödemezsiniz.
        </p>
        <p>
          Tazeliğe ek olarak memleket lezzetlerini de sofranıza taşıyoruz: <b>Yöresel Ürünler</b>{' '}
          rafımızda Antakya&apos;dan gelen kömbe, Hatay biber salçaları, nar ekşisi, zeytin ve
          baharatlar var — hepsi küçük üreticiden, katkısız.
        </p>
        <p>
          Ödeme kapıda (nakit ya da kart). Beğenmediğiniz ürünü kapıda iade edebilirsiniz —
          taze üründe sözümüz budur.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link href="/" className="back">← Alışverişe başla</Link> ·{' '}
          <Link href="/iletisim" className="back">Bize ulaşın →</Link>
        </p>
      </div>
    </div>
  );
}
