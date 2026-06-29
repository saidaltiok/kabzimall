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

type RiskFlag =
  | 'ZARARINA'
  | 'DUSUK_MARJ'
  | 'RAKIPTEN_PAHALI'
  | 'MALIYET_TANIMSIZ'
  | 'HAL_VERISI_YOK';

export interface ProductRow {
  productId: string;
  basePrice: number;
  halAvg: number | null;
  directCost: number | null;
  netMargin: number | null;
  competitorAvg: number | null;
  competitionIndex: number | null;
  costSource: 'PRODUCT' | 'GLOBAL' | null;
  flags: RiskFlag[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly competitors: CompetitorsService,
  ) {}

  /** Fiyatı uygulanmış tüm ürünlerin metrik satırları (Ürünler & Marj tablosu). */
  async productsTable(dateStr?: string): Promise<ProductRow[]> {
    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, basePrice: { not: null } },
      orderBy: { slug: 'asc' },
    });
    return Promise.all(products.map((p) => this.computeRow(p.slug, p.basePrice as number, dateStr)));
  }

  /** KPI + riskli ürünler + son fiyat değişiklikleri (panel ana ekranı). */
  async overview(dateStr?: string) {
    const tenantId = DEV_TENANT_ID;
    const date = dateOnly(dateStr);
    const dayStart = date;
    const dayEnd = new Date(date.getTime() + 86_400_000);

    const [rows, halToday, competitorCount, groupCount, priceChangesToday, priceChangesTotal, recent] =
      await Promise.all([
        this.productsTable(dateStr),
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

    const margins = rows.map((r) => r.netMargin).filter((m): m is number => m != null);
    const avgNetMargin = margins.length ? +(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(4) : null;
    const belowCostCount = rows.filter((r) => r.flags.includes('ZARARINA')).length;
    const belowFloorCount = rows.filter((r) => r.flags.includes('DUSUK_MARJ')).length;
    const riskyProducts = rows.filter((r) => r.flags.length > 0);

    return {
      date: date.toISOString().slice(0, 10),
      kpis: {
        pricedProducts: rows.length,
        productsWithHalToday: new Set(halToday.map((h) => h.productSlug)).size,
        competitors: competitorCount,
        competitorGroups: groupCount,
        priceChangesToday,
        priceChangesTotal,
        avgNetMargin,
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

  /** Tek ürün için maliyet/marj/rekabet + risk bayrakları (tek kaynak: pricing). */
  private async computeRow(slug: string, basePrice: number, dateStr?: string): Promise<ProductRow> {
    const flags: RiskFlag[] = [];
    let directCost: number | null = null;
    let nm: number | null = null;
    let ci: number | null = null;
    let halAvg: number | null = null;
    let costSource: 'PRODUCT' | 'GLOBAL' | null = null;

    const cost = await this.costs.costForProduct(slug).catch(() => null);
    if (!cost) {
      flags.push('MALIYET_TANIMSIZ');
    } else {
      costSource = cost.source;
      halAvg = cost.halAvg;
      if (cost.breakdown == null || cost.directCost == null) {
        flags.push('HAL_VERISI_YOK');
      } else {
        directCost = cost.directCost;
        nm = netMargin(cost.breakdown, basePrice);
        if (basePrice < directCost) flags.push('ZARARINA');
        else if (nm < DEFAULT_FLOOR_MARGIN) flags.push('DUSUK_MARJ');
      }
    }

    const comp = await this.competitors.pricesFor(slug, dateStr);
    const competitorAvg = comp.count > 0 ? comp.average : null;
    if (comp.count > 0) {
      const list: Competitor[] = comp.entries.map((e) => ({ name: e.competitor, group: e.group, price: e.price }));
      ci = competitionIndex(basePrice, list);
      if (ci != null && ci > 110) flags.push('RAKIPTEN_PAHALI');
    }

    return { productId: slug, basePrice, halAvg, directCost, netMargin: nm, competitorAvg, competitionIndex: ci, costSource, flags };
  }
}
