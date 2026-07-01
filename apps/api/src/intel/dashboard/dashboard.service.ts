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
import { PricingRulesService } from '../pricing-rules/pricing-rules.service';

type RiskFlag =
  | 'ZARARINA'
  | 'DUSUK_MARJ'
  | 'RAKIPTEN_PAHALI'
  | 'MALIYET_TANIMSIZ'
  | 'HAL_VERISI_YOK';

export interface Alert {
  productId: string;
  code: RiskFlag;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

const fmtTL = (k: number | null) => (k == null ? '—' : (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺');
const fmtPct = (r: number | null) => (r == null ? '—' : '%' + Math.round(r * 100));

export interface ProductRow {
  productId: string;
  basePrice: number;
  halAvg: number | null;
  directCost: number | null;
  netMargin: number | null;
  competitorAvg: number | null;
  competitionIndex: number | null;
  costSource: 'PRODUCT' | 'GLOBAL' | null;
  /** Bu ürün için geçerli taban marj (kural varsa ondan, yoksa varsayılan). */
  floorUsed: number;
  flags: RiskFlag[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly competitors: CompetitorsService,
    private readonly rules: PricingRulesService,
  ) {}

  /** Bir ürün satırını okunur uyarı mesajlarına çevirir (PRD §8.9). */
  private buildAlerts(r: ProductRow): Alert[] {
    const out: Alert[] = [];
    for (const f of r.flags) {
      if (f === 'ZARARINA') {
        out.push({ productId: r.productId, code: f, severity: 'high', message: `${r.productId} maliyetinin ALTINDA satılıyor (${fmtTL(r.basePrice)} < maliyet ${fmtTL(r.directCost)}). Fiyatı yükselt.` });
      } else if (f === 'DUSUK_MARJ') {
        out.push({ productId: r.productId, code: f, severity: 'medium', message: `${r.productId} taban marjın altında (net ${fmtPct(r.netMargin)} < taban ${fmtPct(r.floorUsed)}).` });
      } else if (f === 'RAKIPTEN_PAHALI') {
        const pct = r.competitionIndex != null ? r.competitionIndex - 100 : null;
        out.push({ productId: r.productId, code: f, severity: 'medium', message: `${r.productId} rakiplerden %${pct} pahalı (endeks ${r.competitionIndex}). Satış düşebilir.` });
      } else if (f === 'MALIYET_TANIMSIZ') {
        out.push({ productId: r.productId, code: f, severity: 'low', message: `${r.productId} için maliyet bileşeni tanımlı değil; marj hesaplanamıyor.` });
      } else if (f === 'HAL_VERISI_YOK') {
        out.push({ productId: r.productId, code: f, severity: 'low', message: `${r.productId} için güncel hal fiyatı yok; maliyet/marj eksik.` });
      }
    }
    return out;
  }

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

    // Okunur uyarılar — önem sırasıyla (high → low).
    const sevRank = { high: 0, medium: 1, low: 2 } as const;
    const alerts = rows
      .flatMap((r) => this.buildAlerts(r))
      .sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

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
      alerts,
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

    // Ürün için geçerli taban marj: kural varsa ondan, yoksa varsayılan.
    const rule = await this.rules.resolveEffective(slug).catch(() => null);
    const floorUsed = rule?.floorMargin ?? DEFAULT_FLOOR_MARGIN;

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
        else if (nm < floorUsed) flags.push('DUSUK_MARJ');
      }
    }

    const comp = await this.competitors.pricesFor(slug, dateStr);
    const competitorAvg = comp.count > 0 ? comp.average : null;
    if (comp.count > 0) {
      const list: Competitor[] = comp.entries.map((e) => ({ name: e.competitor, group: e.group, price: e.price }));
      ci = competitionIndex(basePrice, list);
      if (ci != null && ci > 110) flags.push('RAKIPTEN_PAHALI');
    }

    return { productId: slug, basePrice, halAvg, directCost, netMargin: nm, competitorAvg, competitionIndex: ci, costSource, floorUsed, flags };
  }
}
