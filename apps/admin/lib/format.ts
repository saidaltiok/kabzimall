/** Kuruş (integer) → "34,90 ₺". Para her yerde kuruş tutulur (tek kaynak kuralı). */
export function tl(kurus: number | null | undefined): string {
  if (kurus == null) return '—';
  return (
    (kurus / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ₺'
  );
}

/** 0..1 oran → "%29,0". */
export function pct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return '%' + (rate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

/** ISO tarih-saat → "29.06.2026 16:00". */
export function dt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}
