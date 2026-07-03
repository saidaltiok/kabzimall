import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/** Online manav siteleri — sunucu tarafı (SSR) çekilebilenler. */
interface ManavSite {
  key: string;
  competitor: string; // seed'deki rakip adı ile birebir
  base: string;
  paths: string[]; // taranacak kategori sayfaları
  parse: (html: string) => RawItem[];
}
export interface RawItem { name: string; priceKurus: number }
export interface ManavPrice { name: string; slug: string; product: string; priceKurus: number; unit: string }

/** Türkçe-duyarlı slug. */
function slugifyTr(s: string): string {
  const m: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s.trim().toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => m[c] ?? c).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Ad eşlemesinde yok sayılan kelimeler (marka/sıfat/birim).
const STOP = new Set(['taze', 'organik', 'yerli', 'kg', 'gr', 'gram', 'adet', 'demet', 'paket', 'kalite', 'ithal', 'soyulmus', 'konserve', 'dilimli', 'yikanmis']);
// İşlenmiş/paketli/çoklu ürünleri ele (tekil taze meyve-sebze dışı).
const PROCESSED = /suyu|püre|pure|konserve|salça|salca|reçel|recel|turşu|tursu|kurutulmu|cips|sos|çorba|corba|dondurma|smoothie|shot|kombucha|\bml\b|\bset\b|seti|kutu|\bmix\b|\bpaketi\b|&|\|/i;

/** BİZİM ürün adı: parantez içi ÇEŞİT'i koru (Capia, Sivri), birim parantezini at. */
function productWords(name: string): Set<string> {
  const cleaned = name.replace(/\(([^)]*)\)/g, (_m, inner) =>
    /\d|kg|gr|gram|adet|demet|bağ|bag|paket/i.test(inner) ? ' ' : ' ' + inner + ' ',
  );
  return new Set(slugifyTr(cleaned).split('-').filter((w) => w.length > 2 && !STOP.has(w)));
}

/**
 * TARANAN manav adı: ürün adı ilk parantezden öncedir ("Sivri Biber (500 gr)
 * Çiftlik-Bursa" → "Sivri Biber"). Birim/çiftlik/konum ekini kırpar.
 */
function scrapedWords(name: string): Set<string> {
  const base = name.split('(')[0].trim();
  const src = base.length >= 3 ? base : name;
  return new Set(slugifyTr(src).split('-').filter((w) => w.length > 2 && !STOP.has(w)));
}

// Bu gramajın altındaki paketleri kg'ye ekstrapole ETME: küçük butik poşetler
// (25-100g fesleğen/roka gibi) kg başına anlamsız şişik fiyat üretir — istatistiksel
// olarak güvenilmez, hal/toplu kg fiyatını temsil etmez.
const MIN_GRAMS_FOR_KG_EXTRAPOLATION = 150;

/** Parantez/ad içindeki birimi kg fiyatına normalize et (ağırlıksa). adet/demet ham kalır. null = güvenilmez, ele. */
function normalizeToKg(name: string, priceKurus: number): { priceKurus: number; unit: string } | null {
  const g = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g)\b/i);
  if (g) {
    const val = parseFloat(g[1].replace(',', '.'));
    const grams = /kg/i.test(g[2]) ? val * 1000 : val;
    if (grams > 0 && grams < MIN_GRAMS_FOR_KG_EXTRAPOLATION) return null;
    if (grams > 0) return { priceKurus: Math.round(priceKurus / (grams / 1000)), unit: 'kg' };
  }
  if (/adet/i.test(name)) return { priceKurus, unit: 'adet' };
  if (/demet|bağ|bag/i.test(name)) return { priceKurus, unit: 'demet' };
  return { priceKurus, unit: 'kg' }; // birim yoksa kg varsay
}

/** "70,00 TL" ya da "₺179,00" (binlik ayraçlı da olabilir) → kuruş. */
function parseTl(s: string): number {
  if (!/\d[.,]\d{2}/.test(s)) return 0;
  const n = parseFloat(s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Ticimax tabanlı manav parser (productName detailUrl + discountPriceSpan).
 * Fiyat formatından bağımsız (₺ önde ya da TL arkada). sebzemeyvedunyasi,
 * tazedukkan gibi Ticimax siteleri için ortak.
 */
export function parseTicimax(html: string): RawItem[] {
  const items: RawItem[] = [];
  const blocks = html.split(/class="productName detailUrl"/i).slice(1);
  for (const b of blocks) {
    const name = (b.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    if (!name) continue;
    const span = b.match(/discountPriceSpan[^>]*>([\s\S]{0,40}?)<\/span>/i)?.[1];
    const priceStr = span ?? b.match(/(?:₺\s*[\d.]+,\d{2}|[\d.]+,\d{2}\s*TL)/i)?.[0] ?? '';
    const priceKurus = parseTl(priceStr);
    if (priceKurus > 0) items.push({ name, priceKurus });
  }
  return items;
}

const SITES: ManavSite[] = [
  {
    key: 'sebzemeyvedunyasi',
    competitor: 'Sebze Meyve Dünyası',
    base: 'https://www.sebzemeyvedunyasi.com',
    paths: ['/sebze', '/meyve'],
    parse: parseTicimax,
  },
  {
    key: 'tazedukkan',
    competitor: 'Taze Dükkan',
    base: 'https://www.tazedukkan.com.tr',
    paths: ['/meyvesebze'],
    parse: parseTicimax,
  },
  {
    key: 'tazemasa',
    competitor: 'TazeMasa',
    base: 'https://www.tazemasa.com',
    paths: ['/taze-sebzeler', '/taze-meyveler-250'],
    parse: parseTicimax,
  },
];

@Injectable()
export class ManavService {
  private readonly logger = new Logger(ManavService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ham manav ürünlerini bizim ürünlerimize kelime-kümesi örtüşmesiyle eşler
   * (sıralamadan bağımsız: "Sivri Biber" ↔ "Biber (Sivri)"). Saf/test edilebilir.
   */
  static match(raw: RawItem[], products: { slug: string; name: string }[]): ManavPrice[] {
    const prodWords = products.map((p) => ({ ...p, w: productWords(p.name) }));
    const best = new Map<string, ManavPrice>(); // slug → en düşük fiyat
    for (const it of raw) {
      if (PROCESSED.test(it.name)) continue;
      const w = scrapedWords(it.name);
      if (w.size === 0) continue;
      let pick: (typeof prodWords)[number] | null = null;
      let pickScore = 0;
      for (const p of prodWords) {
        if (p.w.size === 0) continue;
        const inter = [...p.w].filter((x) => w.has(x)).length;
        // ürün kelimeleri taranan ada tümüyle giriyorsa (P⊆S) ya da tersi → güçlü eşleşme
        const subset = inter === p.w.size || inter === w.size;
        const score = subset ? inter + 0.5 : inter;
        if (subset && score > pickScore) { pickScore = score; pick = p; }
      }
      if (!pick) continue;
      const normalized = normalizeToKg(it.name, it.priceKurus);
      if (!normalized) continue; // küçük butik paket → güvenilmez ekstrapolasyon, ele
      const { priceKurus, unit } = normalized;
      const cur = best.get(pick.slug);
      if (!cur || priceKurus < cur.priceKurus) best.set(pick.slug, { name: it.name, slug: pick.slug, product: pick.name, priceKurus, unit });
    }
    return [...best.values()];
  }

  private async fetchSite(site: ManavSite): Promise<RawItem[]> {
    const all: RawItem[] = [];
    for (const path of site.paths) {
      const res = await fetch(site.base + path, { headers: { 'User-Agent': UA } }).catch(() => null);
      if (res?.ok) all.push(...site.parse(await res.text()));
    }
    return all;
  }

  /** Önizleme (kaydetmez). */
  async preview(siteKey: string) {
    const site = SITES.find((s) => s.key === siteKey);
    if (!site) throw new BadRequestException(`Bilinmeyen manav: ${siteKey}. Geçerli: ${SITES.map((s) => s.key).join(', ')}`);
    const products = await this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' }, select: { slug: true, name: true } });
    const raw = await this.fetchSite(site);
    return { site: site.key, competitor: site.competitor, scanned: raw.length, matched: ManavService.match(raw, products) };
  }

  /** Çek + kaydet (append-only, tarih damgalı). */
  async importSite(siteKey: string) {
    const site = SITES.find((s) => s.key === siteKey);
    if (!site) throw new BadRequestException(`Bilinmeyen manav: ${siteKey}. Geçerli: ${SITES.map((s) => s.key).join(', ')}`);
    const [products, competitor] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' }, select: { slug: true, name: true } }),
      this.prisma.competitor.findFirst({ where: { tenantId: DEV_TENANT_ID, name: site.competitor } }),
    ]);
    if (!competitor) throw new BadRequestException(`Rakip kaydı yok: ${site.competitor} (önce seed).`);
    const raw = await this.fetchSite(site);
    const matched = ManavService.match(raw, products);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    for (const m of matched) {
      await this.prisma.competitorPriceEntry.create({
        data: { tenantId: DEV_TENANT_ID, productSlug: m.slug, competitorId: competitor.id, price: m.priceKurus, source: site.key, date: today },
      });
    }
    this.logger.log(`Manav ${site.key}: ${raw.length} tarandı, ${matched.length} eşleşti/yazıldı.`);
    return { site: site.key, competitor: site.competitor, scanned: raw.length, recorded: matched.length, matched };
  }

  sites() {
    return SITES.map((s) => ({ key: s.key, competitor: s.competitor }));
  }
}
