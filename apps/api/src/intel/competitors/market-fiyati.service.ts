import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

const API_URL = 'https://api.marketfiyati.org.tr/api/v2/search';
// İstanbul merkez — konum bazlı fiyat için (ileride ayarlanabilir).
const LAT = 41.0082;
const LNG = 28.9784;

/** marketfiyati marketAdi → bizim rakip adımız (seed'de tanımlı olanlar). */
const MARKET_TO_COMPETITOR: Record<string, string> = {
  a101: 'A101', bim: 'BİM', sok: 'ŞOK', migros: 'Migros', carrefour: 'Carrefour', tarim_kredi: 'Tarım Kredi',
};

interface DepotInfo { marketAdi: string; price: number; unitPrice?: string }
interface MfItem { title: string; menu_category?: string; productDepotInfoList?: DepotInfo[] }

export interface MarketPrice { market: string; competitor: string; price: number; title: string }

/**
 * marketfiyati sonuçlarından, aranan ürünle eşleşen TAZE ürünleri süzüp market
 * başına temsili (en düşük) fiyatı kuruş cinsinden döndürür. Saf/test edilebilir.
 */
const PROCESSED = /püre|pouch|cips|kuru|konserve|salça|salca|reçel|recel|turşu|tursu|yulaf|bebek|aroma|dondurma|nektar|suyu|püresi|gofret|çubuk/i;

export function aggregateProducePrices(content: MfItem[], keyword: string): MarketPrice[] {
  const kw = keyword.toLocaleLowerCase('tr');
  const matches = (content || []).filter((it) => {
    const title = (it.title || '').toLocaleLowerCase('tr');
    if (!title.includes(kw)) return false;
    if (PROCESSED.test(title)) return false; // işlenmiş/paketli ürünleri ele
    // Yalnızca taze meyve-sebze: kategori "Meyve ve Sebze" olmalı.
    return /meyve ve sebze/i.test(it.menu_category || '');
  });
  const byMarket = new Map<string, MarketPrice>();
  for (const it of matches) {
    for (const d of it.productDepotInfoList || []) {
      const competitor = MARKET_TO_COMPETITOR[d.marketAdi];
      if (!competitor || !(d.price > 0)) continue;
      const kurus = Math.round(d.price * 100);
      const cur = byMarket.get(d.marketAdi);
      if (!cur || kurus < cur.price) byMarket.set(d.marketAdi, { market: d.marketAdi, competitor, price: kurus, title: it.title });
    }
  }
  return [...byMarket.values()];
}

@Injectable()
export class MarketFiyatiService {
  constructor(private readonly prisma: PrismaService) {}

  private async search(keyword: string): Promise<MfItem[]> {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ keywords: keyword, pages: 0, size: 50, latitude: LAT, longitude: LNG, distance: 50 }),
    }).catch(() => null);
    if (!res || !res.ok) throw new BadRequestException('marketfiyati servisine ulaşılamadı.');
    const j = (await res.json().catch(() => null)) as { content?: MfItem[] } | null;
    return j?.content ?? [];
  }

  /** Önizleme: ürün için market market fiyatlar (kaydetmeden). */
  async preview(keyword: string): Promise<{ keyword: string; prices: MarketPrice[] }> {
    if (!keyword?.trim()) throw new BadRequestException('keyword gerekli');
    const prices = aggregateProducePrices(await this.search(keyword.trim()), keyword.trim());
    return { keyword: keyword.trim(), prices };
  }

  /**
   * Ürün için marketfiyati'ndan rakip fiyatlarını çekip kaydeder (append-only).
   * keyword verilmezse ürün adı/slug kullanılır. Eşleşen marketler bizim rakip
   * kayıtlarına bağlanır (A101/BİM/ŞOK/Migros/Carrefour).
   */
  async importForProduct(productId: string, keyword?: string) {
    const product = await this.prisma.product
      .findFirst({ where: { tenantId: DEV_TENANT_ID, slug: productId }, select: { name: true } })
      .catch(() => null);
    const kw = (keyword || product?.name || productId).trim();
    const prices = aggregateProducePrices(await this.search(kw), kw);
    if (prices.length === 0) {
      return { productId, keyword: kw, matched: 0, recorded: 0, prices: [] as MarketPrice[], note: 'marketfiyati bu ürün için taze eşleşme döndürmedi.' };
    }

    const competitors = await this.prisma.competitor.findMany({ where: { tenantId: DEV_TENANT_ID } });
    const byName = new Map(competitors.map((c) => [c.name, c.id]));

    let recorded = 0;
    for (const p of prices) {
      const competitorId = byName.get(p.competitor);
      if (!competitorId) continue;
      await this.prisma.competitorPriceEntry.create({
        data: { tenantId: DEV_TENANT_ID, productSlug: productId, competitorId, price: p.price, source: 'marketfiyati', date: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') },
      });
      recorded++;
    }
    return { productId, keyword: kw, matched: prices.length, recorded, prices };
  }

  /**
   * Toplu çekim: verilen slug'lar (yoksa tüm SIMPLE ürünler) için marketfiyati'ndan
   * rakip fiyatlarını çeker ve kaydeder. Kaynağı yormamak için sınırlı eşzamanlılık.
   * marketfiyati taze meyve-sebze kapsamı kısıtlı → yalnızca eşleşenler yazılır.
   */
  async bulkImport(slugs?: string[]) {
    const where = slugs?.length
      ? { tenantId: DEV_TENANT_ID, slug: { in: slugs } }
      : { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' as const };
    const products = await this.prisma.product.findMany({ where, select: { slug: true, name: true } });
    const competitors = await this.prisma.competitor.findMany({ where: { tenantId: DEV_TENANT_ID } });
    const byName = new Map(competitors.map((c) => [c.name, c.id]));
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const results: { slug: string; matched: number; recorded: number; markets: string[] }[] = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < products.length; i += CONCURRENCY) {
      const batch = products.slice(i, i + CONCURRENCY);
      const batchRes = await Promise.all(
        batch.map(async (p) => {
          try {
            const prices = aggregateProducePrices(await this.search(p.name), p.name);
            let recorded = 0;
            for (const pr of prices) {
              const competitorId = byName.get(pr.competitor);
              if (!competitorId) continue;
              await this.prisma.competitorPriceEntry.create({
                data: { tenantId: DEV_TENANT_ID, productSlug: p.slug, competitorId, price: pr.price, source: 'marketfiyati', date: today },
              });
              recorded++;
            }
            return { slug: p.slug, matched: prices.length, recorded, markets: prices.map((x) => x.competitor) };
          } catch {
            return { slug: p.slug, matched: 0, recorded: 0, markets: [] as string[] };
          }
        }),
      );
      results.push(...batchRes);
    }
    return {
      total: products.length,
      withData: results.filter((r) => r.recorded > 0).length,
      recorded: results.reduce((s, r) => s + r.recorded, 0),
      results: results.filter((r) => r.recorded > 0).sort((a, b) => b.recorded - a.recorded),
    };
  }
}
