import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

const PAGE_URL = 'https://tarim.ibb.istanbul/avrupa-yakasi-hal-mudurlugu/hal-fiyatlari.html';
const DAILY_URL = 'https://tarim.ibb.istanbul/inc/halfiyatlari/gunluk_fiyatlar.asp';
const HAL_TUR_ID = '2'; // Avrupa Yakası hali
const CATEGORIES: Record<string, string> = { '5': 'Meyve', '6': 'Sebze', '7': 'İthal' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

export interface IbbRow { sourceName: string; unit: string | null; low: number; high: number; price: number }
export interface PreviewRow extends IbbRow { category: string; matchedSlug: string | null; matchedName: string | null }

/** Türkçe-duyarlı slug (İBB "Çilek" → "cilek", "Salatalık" → "salatalik"). */
export function slugifyTr(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "50,00 TL" gibi bir hücreyi kuruşa çevirir (virgül ondalık). */
function parsePriceTr(cell: string): number {
  const m = cell.replace(/<[^>]+>/g, '').match(/([\d.]+),(\d{1,2})/) ?? cell.match(/(\d+)/);
  if (!m) return 0;
  const whole = (m[1] ?? '0').replace(/\./g, '');
  const frac = (m[2] ?? '0').padEnd(2, '0').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(frac, 10);
}

/** İBB günlük fiyat HTML tablosunu satırlara çevirir (saf; test edilebilir). */
export function parseIbbTable(html: string): IbbRow[] {
  const rows: IbbRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html))) {
    if (/<th/i.test(m[1])) continue; // başlık satırı
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 4) continue;
    const name = cells[0].replace(/<[^>]+>/g, '').trim();
    const unit = cells[1].replace(/<[^>]+>/g, '').trim() || null;
    const low = parsePriceTr(cells[2]);
    const high = parsePriceTr(cells[3]);
    if (!name) continue;
    rows.push({ sourceName: name, unit, low, high, price: Math.round((low + high) / 2) });
  }
  return rows;
}

@Injectable()
export class IbbHalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sayfadan güncel erişim token'larını çeker (rotasyona dayanıklı). */
  private async fetchTokens(): Promise<{ tUsr: string; tPas: string; tVal: string }> {
    const res = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new BadRequestException(`İBB sayfasına ulaşılamadı (${res.status})`);
    const html = await res.text();
    const grab = (k: string) => html.match(new RegExp(`obj\\.${k}\\s*=\\s*"([^"]+)"`))?.[1];
    const tUsr = grab('tUsr'); const tPas = grab('tPas'); const tVal = grab('tVal');
    if (!tUsr || !tPas || !tVal) throw new BadRequestException('İBB erişim anahtarları sayfadan okunamadı (kaynak değişmiş olabilir).');
    return { tUsr, tPas, tVal };
  }

  /** Bir kategori için günlük İBB fiyatları (ham satırlar). */
  private async fetchCategory(date: string, category: string, tokens: { tUsr: string; tPas: string; tVal: string }): Promise<IbbRow[]> {
    const q = new URLSearchParams({ tarih: date, kategori: category, tUsr: tokens.tUsr, tPas: tokens.tPas, tVal: tokens.tVal, HalTurId: HAL_TUR_ID });
    const res = await fetch(`${DAILY_URL}?${q.toString()}`, { headers: { 'User-Agent': UA, Referer: PAGE_URL } });
    if (!res.ok) throw new BadRequestException(`İBB fiyat servisi hata verdi (${res.status})`);
    return parseIbbTable(await res.text());
  }

  /**
   * Önizleme: verilen gün için İBB fiyatlarını çeker, her satırı bizim slug'a
   * eşler (kayıtlı eşleme → yoksa slug-adı katalogda varsa otomatik). category
   * verilmezse üç kategoriyi de getirir.
   */
  async preview(date: string, category?: string): Promise<{ date: string; rows: PreviewRow[]; unmatched: number }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('tarih YYYY-MM-DD olmalı');
    const cats = category ? [category] : Object.keys(CATEGORIES);
    for (const c of cats) if (!CATEGORIES[c]) throw new BadRequestException(`Geçersiz kategori: ${c}`);

    const tokens = await this.fetchTokens();
    const [mappings, products] = await Promise.all([
      this.prisma.halSourceMapping.findMany({ where: { tenantId: DEV_TENANT_ID, source: 'IBB' } }),
      this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' }, select: { slug: true, name: true } }),
    ]);
    const mapBySource = new Map(mappings.map((m) => [m.sourceName, m.productSlug]));
    const bySlug = new Map(products.map((p) => [p.slug, p.name]));

    const rows: PreviewRow[] = [];
    for (const c of cats) {
      const ibb = await this.fetchCategory(date, c, tokens);
      for (const r of ibb) {
        const mapped = mapBySource.get(r.sourceName) ?? (bySlug.has(slugifyTr(r.sourceName)) ? slugifyTr(r.sourceName) : null);
        rows.push({ ...r, category: CATEGORIES[c], matchedSlug: mapped, matchedName: mapped ? bySlug.get(mapped) ?? null : null });
      }
    }
    return { date, rows, unmatched: rows.filter((r) => !r.matchedSlug).length };
  }

  listMappings() {
    return this.prisma.halSourceMapping.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: { sourceName: 'asc' } });
  }

  async upsertMapping(sourceName: string, productSlug: string) {
    const sn = sourceName.trim(); const slug = productSlug.trim();
    if (!sn || !slug) throw new BadRequestException('sourceName ve productSlug gerekli');
    return this.prisma.halSourceMapping.upsert({
      where: { tenantId_source_sourceName: { tenantId: DEV_TENANT_ID, source: 'IBB', sourceName: sn } },
      create: { tenantId: DEV_TENANT_ID, source: 'IBB', sourceName: sn, productSlug: slug },
      update: { productSlug: slug },
    });
  }

  async removeMapping(id: string) {
    await this.prisma.halSourceMapping.deleteMany({ where: { id, tenantId: DEV_TENANT_ID } });
    return { deleted: true };
  }
}
