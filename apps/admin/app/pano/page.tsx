import { redirect } from 'next/navigation';

/**
 * Eski "Operasyon Panosu" ekranı Siparişler'in "Pano" görünümüyle birleşti —
 * aynı iş iki ekranda yapılmasın diye. Eski yer imleri buraya düşerse yönlendir.
 */
export default function PanoRedirect() {
  redirect('/siparisler');
}
