import { Injectable } from '@nestjs/common';
import {
  competitionIndex,
  netMargin,
  DEFAULT_FLOOR_MARGIN,
  type Competitor,
} from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { dateOnly } from '../../common/date';
import { CostComponentsService } from '../cost-components/cost-components.service';
import { CompetitorsService } from '../competitors/competitors.service';

/** Bir ürünün dikkat gerektiren durumları. */
type RiskFlag =
  | 'ZARARINA' // base_price < directCost
  | 'DUSUK_MARJ' // net marj taban marjın altında
  | 'RAKIPTEN_PAHALI' // rakip ortalamasının %10+ üstünde
  | 'MALIYET_TANIMSIZ' // hiç maliyet bileşeni yok
  | 'HAL_VERISI_YOK'; // maliyet var ama hal fiyatı yok → marj hesaplanamaz

export interface RiskyProduct {
  productId: string;
  basePrice: number;
  directCost: number | null;
  netMargin: number | null;
  competitionIndex: number | null;
  flags: RiskFlag[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly competitors: CompetitorsService,
  ) {}

  /**
   * Fiyatı uygulanmış ürünler üzerinden KPI + riskli ürün + son değişiklikler.
   * Marj/rekabet türetimi packages/pricing ile (tek kaynak). N+1 sorgu içerir;
   * iskelet ölçeğinde sorun değil, ileride denormalize edilebilir.
   */
  async overview(dateStr?: string) {
    const tenantId = DEV_TENANT_ID;
    const date = dateOnly(dateStr);
    const dayStart = date;
    const dayEnd = new Date(date.getTime() + 86_400_000);

    const [products, halToday, competitorCount, groupCount, priceChangesToday, priceChangesTotal, recent] =
      await Promise.all([
        this.prisma.product.findMany({ where: { tenantId, basePrice: { not: null } } }),
        this.prisma.halPriceEntry.findMany({ where: { tenantId, date }, select: { productSlug: true } }),
        this.prisma.competitor.count({ where: { tenantId } }),
        this.prisma.competitorGroup.count({ where: { tenantId } }),
        this.prisma.priceHistory.count({ where: { tenantId, changedAt: { gte: dayStart, lt: dayEnd } } }),
        this.prisma.priceHistory.count({ where: { tenantId } }),
        this.prisma.priceHistory.findMany({
          where: { tenantId },
          orderBy: { changedAt: 'desc' },
          take: 10,
          include: { product: { select: { slug: true } } },
        }),
      ]);

    const halSlugsToday = new Set(halToday.map((h) => h.productSlug));
    const riskyProducts: RiskyProduct[] = [];
    let marginSum = 0;
    let marginCount = 0;
    let belowFloorCount = 0;
    let belowCostCount = 0;

    for (const p of products) {
      const basePrice = p.basePrice as number;
      const flags: RiskFlag[] = [];
      let dc: number | null = null;
      let nm: number | null = null;
      let ci: number | null = null;

      const cost = await this.costs.costForProduct(p.slug).catch(() => null);
      if (!cost) {
        flags.push('MALIYET_TANIMSIZ');
      } else if (cost.breakdown == null || cost.directCost == null) {
        flags.push('HAL_VERISI_YOK');
      } else {
        dc = cost.directCost;
        nm = netMargin(cost.breakdown, basePrice);
        marginSum += nm;
        marginCount += 1;
        if (basePrice < dc) {
          flags.push('ZARARINA');
          belowCostCount += 1;
        } else if (nm < DEFAULT_FLOOR_MARGIN) {
          flags.push('DUSUK_MARJ');
          belowFloorCount += 1;
        }
      }

      const comp = await this.competitors.pricesFor(p.slug, dateStr);
      if (comp.count > 0) {
        const list: Competitor[] = comp.entries.map((e) => ({
          name: e.competitor,
          group: e.group,
          price: e.price,
        }));
        ci = competitionIndex(basePrice, list);
        if (ci != null && ci > 110) flags.push('RAKIPTEN_PAHALI');
      }

      if (flags.length) {
        riskyProducts.push({ productId: p.slug, basePrice, directCost: dc, netMargin: nm, competitionIndex: ci, flags });
      }
    }

    return {
      date: date.toISOString().slice(0, 10),
      kpis: {
        pricedProducts: products.length,
        productsWithHalToday: halSlugsToday.size,
        competitors: competitorCount,
        competitorGroups: groupCount,
        priceChangesToday,
        priceChangesTotal,
        avgNetMargin: marginCount ? +(marginSum / marginCount).toFixed(4) : null,
        belowFloorCount,
        belowCostCount,
        riskyProductCount: riskyProducts.length,
      },
      riskyProducts,
      recentPriceChanges: recent.map((r) => ({
        productId: r.product.slug,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        strategy: r.strategyApplied,
        changedAt: r.changedAt.toISOString(),
      })),
    };
  }
}
