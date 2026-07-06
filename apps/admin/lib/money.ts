// Tek kaynak para ayrıştırma/biçimleme. Türkçe girişte '.' binlik, ',' ondalık
// ayracıdır: "1.234,50" → 123450 kuruş (eski kopyalanmış parseFloat(replace(','))
// bunu sessizce 1,23 TL'ye çeviriyordu — para bug'ı).

/** TL metin → kuruş (tam sayı). Boş/geçersiz/negatif → null. */
export function tlToKurus(input: string | null | undefined): number | null {
  const s = (input ?? '').trim().replace(/[\s₺]/g, '');
  if (!s) return null;
  let norm: string;
  if (s.includes(',')) {
    norm = s.replace(/\./g, '').replace(',', '.'); // '.' binlik, ',' ondalık
  } else {
    const parts = s.split('.');
    // birden çok nokta ya da tek nokta + tam 3 hane → binlik ("1.234" = 1234);
    // aksi halde ondalık ("12.50" = 12,50).
    norm = parts.length > 2 || (parts.length === 2 && parts[1].length === 3) ? parts.join('') : s;
  }
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Yüzde metin → oran (0-1). "5" → 0.05. Geçersiz → null. */
export function pctToRate(input: string | null | undefined): number | null {
  const n = Number((input ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return n / 100;
}

/** Kuruş → "1.234,50" (tr-TR). */
export const kurusToTl = (k: number) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
