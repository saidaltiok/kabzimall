/**
 * YYYY-MM-DD (verilmezse bugün) → UTC gün başı Date.
 * Prisma @db.Date alanlarında saat dilimi kayması olmaması için kullanılır.
 */
export function dateOnly(s?: string): Date {
  const iso = s ?? new Date().toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00.000Z`);
}
