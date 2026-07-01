import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

const PAGE_URL = 'https://tarim.ibb.istanbul/avrupa-yakasi-hal-mudurlugu/hal-fiyatlari.html';
const DAILY_URL = 'https://tarim.ibb.istanbul/inc/halfiyatlari/gunluk_fiyatlar.asp';
// Yaka → HalTurId. Avrupa=2 doğrulandı; Anadolu=1 yaygın değer (deneysel).
const SIDES: Record<string, string> = { avrupa: '2', anadolu: '1' };
const CATEGORIES: Record<string, string> = { '5': 'Meyve', '6': 'Sebze', '7': 'İthal' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
// Sayfada gömülü, herkese açık (oturuma bağlı değil) erişim anahtarları.
// Öncelik canlı scrape'te; başarısızsa (bot-stripped sayfa) bunlara düşülür.
const FALLBACK_TOKENS = { tUsr: 'M3yV353bZe', tPas: 'LA74sBcXERpdBaz', tVal: '881f3dc3-7d08-40db-b45a-1275c0245685' };

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
  private readonly logger = new Logger(IbbHalService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** İstanbul saatiyle bugünün tarihi (YYYY-MM-DD). */
  private istanbulToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  /**
   * Günlük otomatik İBB içe aktarım. İBB verisi yalnızca gündüz yayın penceresinde
   * dolu olduğundan öğleden sonra üç kez denenir; gün içinde zaten alındıysa atlanır
   * (mükerrer kayıt olmaz), boşsa sessizce loglanır (hata fırlatmaz).
   */
  @Cron('0 11,13,15 * * *', { timeZone: 'Europe/Istanbul' })
  async dailyAutoImport() {
    const date = this.istanbulToday();
    const day = new Date(`${date}T00:00:00.000Z`);
    const already = await this.prisma.halPriceEntry.count({ where: { tenantId: DEV_TENANT_ID, source: 'IBB', date: day } });
    if (already > 0) {
      this.logger.log(`İBB otomatik içe aktarım (${date}): bugün zaten ${already} kayıt var, atlandı.`);
      return;
    }
    try {
      const r = await this.importAll(date, { createMissing: true, side: 'avrupa' });
      this.logger.log(`İBB otomatik içe aktarım (${date}): ${r.priced} fiyat yazıldı, ${r.created} yeni ürün, ${r.totalRows} satır tarandı.`);
    } catch (e) {
      this.logger.warn(`İBB otomatik içe aktarım atlandı (${date}): ${(e as Error).message}`);
    }
  }

  /** Sayfadan güncel erişim token'larını çeker (rotasyona dayanıklı). */
  private async fetchTokens(): Promise<{ tUsr: string; tPas: string; tVal: string }> {
    try {
      const res = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const html = await res.text();
        const grab = (k: string) => html.match(new RegExp(`obj\\.${k}\\s*=\\s*"([^"]+)"`))?.[1];
        const tUsr = grab('tUsr'); const tPas = grab('tPas'); const tVal = grab('tVal');
        if (tUsr && tPas && tVal) return { tUsr, tPas, tVal };
      }
    } catch {
      /* aşağıda fallback */
    }
    return { ...FALLBACK_TOKENS }; // scrape başarısız → bilinen sabit anahtarlar
  }

  /** Bir kategori için günlük İBB fiyatları (ham satırlar). */
  private async fetchCategory(date: string, category: string, halTurId: string, tokens: { tUsr: string; tPas: string; tVal: string }): Promise<IbbRow[]> {
    const q = new URLSearchParams({ tarih: date, kategori: category, tUsr: tokens.tUsr, tPas: tokens.tPas, tVal: tokens.tVal, HalTurId: halTurId });
    const res = await fetch(`${DAILY_URL}?${q.toString()}`, { headers: { 'User-Agent': UA, Referer: PAGE_URL } });
    if (!res.ok) throw new BadRequestException(`İBB fiyat servisi hata verdi (${res.status})`);
    return parseIbbTable(await res.text());
  }

  /**
   * Önizleme: verilen gün için İBB fiyatlarını çeker, her satırı bizim slug'a
   * eşler (kayıtlı eşleme → yoksa slug-adı katalogda varsa otomatik). category
   * verilmezse üç kategoriyi de getirir.
   */
  async preview(date: string, category?: string, side = 'avrupa'): Promise<{ date: string; rows: PreviewRow[]; unmatched: number }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('tarih YYYY-MM-DD olmalı');
    const halTurId = SIDES[side];
    if (!halTurId) throw new BadRequestException(`Geçersiz yaka: ${side}`);
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
      const ibb = await this.fetchCategory(date, c, halTurId, tokens);
      for (const r of ibb) {
        const mapped = mapBySource.get(r.sourceName) ?? (bySlug.has(slugifyTr(r.sourceName)) ? slugifyTr(r.sourceName) : null);
        rows.push({ ...r, category: CATEGORIES[c], matchedSlug: mapped, matchedName: mapped ? bySlug.get(mapped) ?? null : null });
      }
    }
    return { date, rows, unmatched: rows.filter((r) => !r.matchedSlug).length };
  }

  /** İBB birimini bizim unitLabel'a çevir. */
  private mapUnit(u: string | null): string {
    const s = (u ?? '').toLocaleLowerCase('tr');
    if (s.includes('kilogram') || s === 'kg') return 'kg';
    if (s.includes('adet')) return 'adet';
    if (s.includes('demet')) return 'demet';
    if (s.includes('bağ') || s.includes('bag')) return 'bağ';
    return s || 'kg';
  }

  /**
   * TÜM İBB ürünlerini içeri al: sistemde olmayan ürünü (createMissing) katalogda
   * oluştur (kind=SIMPLE, isActive=false — vitrine çıkmaz, önce gözden geçirilir),
   * eşlemeyi kalıcılaştır, günlük hal fiyatını tarih damgasıyla yaz (append-only).
   */
  async importAll(date: string, opts: { category?: string; createMissing?: boolean; side?: string } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('tarih YYYY-MM-DD olmalı');
    const createMissing = opts.createMissing ?? true;
    const halTurId = SIDES[opts.side ?? 'avrupa'];
    if (!halTurId) throw new BadRequestException(`Geçersiz yaka: ${opts.side}`);
    const cats = opts.category ? [opts.category] : Object.keys(CATEGORIES);
    for (const c of cats) if (!CATEGORIES[c]) throw new BadRequestException(`Geçersiz kategori: ${c}`);

    const tokens = await this.fetchTokens();
    const all: IbbRow[] = [];
    for (const c of cats) all.push(...(await this.fetchCategory(date, c, halTurId, tokens)));
    return this.ingestRows(date, all, createMissing);
  }

  /**
   * Dışarıdan (ör. tarayıcıdan) getirilen İBB satırlarını sisteme yazar — İBB'ye
   * sunucudan çıkmadan. importAll ile aynı oluştur/eşle/yaz mantığını paylaşır.
   */
  async ingest(date: string, rows: IbbRow[], createMissing = true) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('tarih YYYY-MM-DD olmalı');
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('İçe alınacak satır yok.');
    return this.ingestRows(date, rows, createMissing);
  }

  /** Ortak: satırları → (eksikse) ürün oluştur + eşleme + tarih damgalı hal fiyatı. */
  private async ingestRows(date: string, rows: IbbRow[], createMissing: boolean) {
    const [mappings, products] = await Promise.all([
      this.prisma.halSourceMapping.findMany({ where: { tenantId: DEV_TENANT_ID, source: 'IBB' } }),
      this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID }, select: { slug: true } }),
    ]);
    const mapBySource = new Map(mappings.map((m) => [m.sourceName, m.productSlug]));
    const existing = new Set(products.map((p) => p.slug));

    const created: string[] = [];
    const newMappings: { sourceName: string; productSlug: string }[] = [];
    const entries: { tenantId: string; productSlug: string; price: number; date: Date; unit: string | null; source: string }[] = [];
    const usedSlug = new Set<string>();
    const day = new Date(`${date}T00:00:00.000Z`);

    for (const r of rows) {
      if (!r.sourceName) continue;
      const slug = mapBySource.get(r.sourceName) ?? slugifyTr(r.sourceName);
      if (!slug) continue;
      if (!existing.has(slug)) {
        if (!createMissing) continue;
        try {
          await this.prisma.product.create({
            data: { tenantId: DEV_TENANT_ID, slug, name: r.sourceName, kind: 'SIMPLE', saleType: 'WEIGHT', unitLabel: this.mapUnit(r.unit), isActive: false },
          });
          existing.add(slug);
          created.push(slug);
        } catch {
          continue; // slug çakışması → atla
        }
      }
      if (!mapBySource.has(r.sourceName)) { mapBySource.set(r.sourceName, slug); newMappings.push({ sourceName: r.sourceName, productSlug: slug }); }
      if (usedSlug.has(slug)) continue; // aynı gün aynı slug'a tek fiyat
      usedSlug.add(slug);
      entries.push({ tenantId: DEV_TENANT_ID, productSlug: slug, price: r.price, date: day, unit: r.unit, source: 'IBB' });
    }

    if (rows.length === 0 || (entries.length === 0 && created.length === 0)) {
      throw new BadRequestException('İBB bu tarih için fiyat döndürmedi (yayın penceresi ya da geçici erişim kısıtı olabilir).');
    }

    await this.prisma.$transaction([
      ...newMappings.map((m) => this.prisma.halSourceMapping.create({ data: { tenantId: DEV_TENANT_ID, source: 'IBB', sourceName: m.sourceName, productSlug: m.productSlug } })),
      ...(entries.length ? [this.prisma.halPriceEntry.createMany({ data: entries })] : []),
    ]);

    return { date, totalRows: rows.length, created: created.length, createdSlugs: created, priced: entries.length };
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
