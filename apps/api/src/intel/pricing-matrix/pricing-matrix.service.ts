import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CostComponentsService } from '../cost-components/cost-components.service';
import { PricingRulesService } from '../pricing-rules/pricing-rules.service';
import { PriceService } from '../price/price.service';
import {
  avg, median as medianFn, effectivePrice, priceForMargin, resolvePrice,
  DEFAULT_FLOOR_MARGIN, type Competitor,
} from '../../pricing-engine';
import { dateOnly } from '../../common/date';

export interface MatrixRow {
  slug: string; name: string; unitLabel: string | null; category: string | null;
  halAvg: number | null;
  byGroup: Record<string, number | null>; // grup adı → ortalama fiyat (kuruş)
  avg: number | null; premiumAvg: number | null; median: number | null; compCount: number;
  currentPrice: number | null;   // yayındaki geçerli fiyat (indirimli varsa o)
  floorPrice: number | null;     // taban marj + komisyona göre en düşük satılabilir
  suggested: number | null;      // motor önerisi (taban korumalı)
  published: boolean;            // aktif + fiyatlı
  belowFloor: boolean;           // güncel fiyat tabanın altında mı
}

/** Basit eşzamanlılık sınırlı map — bağlantı havuzunu yormadan ürün başına async iş. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Fiyatlandırma matrisi: her satır bir ürün; sütunlar hal, rakip grupları,
 * ortalama/premium/medyan, öneri/taban ve yayın durumu. Tek ekranda toplu
 * fiyatlandırma için — hesaplar tek kaynaktan (packages/pricing) gelir.
 */
@Injectable()
export class PricingMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly rules: PricingRulesService,
    private readonly price: PriceService,
  ) {}

  /**
   * Toplu yayın: her satır için yazılan fiyatı uygular (fiyat geçmişine yazar)
   * ve ürünü aktive eder. Taban marjın ALTINA yazılmak istenen fiyat, açıkça
   * izin verilmedikçe engellenir (maliyet güvenlik ağı — tek kaynak: motor).
   */
  async publish(items: { slug: string; price: number }[], allowBelowFloor: boolean, actor: string) {
    const published: string[] = [];
    const blocked: { slug: string; price: number; floor: number }[] = [];
    for (const it of items) {
      if (!Number.isFinite(it.price) || it.price <= 0) { blocked.push({ slug: it.slug, price: it.price, floor: 0 }); continue; }
      const [cost, rule] = await Promise.all([
        this.costs.costForProduct(it.slug).catch(() => null),
        this.rules.resolveEffective(it.slug).catch(() => null),
      ]);
      const floorMargin = rule?.floorMargin ?? DEFAULT_FLOOR_MARGIN;
      const floor = cost?.breakdown ? Math.round(priceForMargin(cost.breakdown, floorMargin)) : null;
      if (!allowBelowFloor && floor != null && it.price < floor) { blocked.push({ slug: it.slug, price: it.price, floor }); continue; }
      await this.price.apply({ productId: it.slug, price: it.price, strategy: 'MANUAL', reason: 'Fiyat matrisi (toplu)', changedBy: actor, allowBelowFloor });
      await this.prisma.product.updateMany({ where: { tenantId: DEV_TENANT_ID, slug: it.slug }, data: { isActive: true } });
      published.push(it.slug);
    }
    return { published, blocked };
  }

  async matrix(dateStr?: string): Promise<{ groups: string[]; rows: MatrixRow[]; date: string }> {
    const date = dateOnly(dateStr);

    const [products, groups, compRows, catRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE', OR: [{ isActive: true }, { basePrice: { not: null } }] },
        orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
        select: { slug: true, name: true, unitLabel: true, basePrice: true, discountedPrice: true, isActive: true, category: { select: { name: true } } },
      }),
      this.prisma.competitorGroup.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: { name: 'asc' }, select: { name: true } }),
      // Bugünkü tüm rakip fiyatları — tek sorgu; rakip başına EN GÜNCEL (asc → son yazan).
      this.prisma.competitorPriceEntry.findMany({
        where: { tenantId: DEV_TENANT_ID, date },
        orderBy: { capturedAt: 'asc' },
        select: { productSlug: true, price: true, competitorId: true, competitor: { select: { group: { select: { name: true } } } } },
      }),
      this.prisma.category.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: { sortOrder: 'asc' }, select: { name: true } }),
    ]);

    // Ürün → (competitorId → {group, price}) en güncel
    const byProduct = new Map<string, Map<string, { group: string; price: number }>>();
    for (const r of compRows) {
      let m = byProduct.get(r.productSlug);
      if (!m) { m = new Map(); byProduct.set(r.productSlug, m); }
      m.set(r.competitorId, { group: r.competitor.group.name, price: r.price });
    }

    const groupNames = groups.map((g) => g.name);

    const rows = await mapLimit(products, 8, async (p): Promise<MatrixRow> => {
      const compMap = byProduct.get(p.slug);
      const entries = compMap ? [...compMap.values()] : [];
      const prices = entries.map((e) => e.price);

      // Grup bazlı ortalama
      const byGroup: Record<string, number | null> = {};
      for (const g of groupNames) {
        const gp = entries.filter((e) => e.group === g).map((e) => e.price);
        byGroup[g] = gp.length ? Math.round(avg(gp)) : null;
      }
      const med = prices.length ? Math.round(medianFn(prices)) : null;
      // Premium ortalama: medyan ÜSTÜ fiyatların ortalaması (üst segment); yetersizse genel ort.
      const upper = med != null ? prices.filter((x) => x > med) : [];
      const premiumAvg = upper.length ? Math.round(avg(upper)) : prices.length ? Math.round(avg(prices)) : null;

      // Maliyet + taban marj → taban fiyat ve öneri
      const [cost, rule] = await Promise.all([
        this.costs.costForProduct(p.slug).catch(() => null),
        this.rules.resolveEffective(p.slug).catch(() => null),
      ]);
      const floorMargin = rule?.floorMargin ?? DEFAULT_FLOOR_MARGIN;
      let floorPrice: number | null = null;
      let suggested: number | null = null;
      if (cost?.breakdown) {
        floorPrice = Math.round(priceForMargin(cost.breakdown, floorMargin));
        const competitors: Competitor[] = entries.map((e) => ({ name: e.group, group: e.group, price: e.price }));
        suggested = resolvePrice(cost.breakdown, competitors, undefined, { floorMargin, psychological: true }).price;
      }

      const currentPrice = p.basePrice != null ? effectivePrice(p.basePrice, p.discountedPrice) : null;
      return {
        slug: p.slug, name: p.name, unitLabel: p.unitLabel, category: p.category?.name ?? null,
        halAvg: cost?.halAvg ?? null,
        byGroup, avg: prices.length ? Math.round(avg(prices)) : null, premiumAvg, median: med, compCount: prices.length,
        currentPrice, floorPrice, suggested,
        published: p.isActive && p.basePrice != null,
        belowFloor: currentPrice != null && floorPrice != null && currentPrice < floorPrice,
      };
    });

    // Kategori sırası: bilinen kategoriler önce, sonra diğerleri
    const catOrder = catRows.map((c) => c.name);
    rows.sort((a, b) => {
      const ai = catOrder.indexOf(a.category ?? ''); const bi = catOrder.indexOf(b.category ?? '');
      if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return a.name.localeCompare(b.name, 'tr');
    });

    return { groups: groupNames, rows, date: date.toISOString().slice(0, 10) };
  }
}
