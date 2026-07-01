import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

interface DayPoint { date: string; units: number; orders: number; revenue: number }

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const round3 = (n: number) => +n.toFixed(3);

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bir ürünün son N günlük satış serisi (iptaller hariç). Sipariş verisinden. */
  async salesSeries(productSlug: string, days = 30) {
    const d = Math.min(365, Math.max(1, days));
    const product = await this.prisma.product
      .findFirst({ where: { tenantId: DEV_TENANT_ID, slug: productSlug }, select: { id: true } })
      .catch(() => null);
    const empty = { productId: productSlug, days: d, series: [] as DayPoint[], summary: { totalUnits: 0, totalRevenue: 0, activeDays: 0, avgDailyUnits: 0 } };
    if (!product) return empty;

    const since = new Date();
    since.setDate(since.getDate() - d);
    since.setHours(0, 0, 0, 0);

    const items = await this.prisma.orderItem.findMany({
      where: { productId: product.id, order: { tenantId: DEV_TENANT_ID, status: { not: 'CANCELLED' }, createdAt: { gte: since } } },
      select: { orderedQty: true, pickedQty: true, lineTotal: true, order: { select: { id: true, createdAt: true } } },
    });

    const byDay = new Map<string, { units: number; orders: Set<string>; revenue: number }>();
    for (const it of items) {
      const key = dayKey(it.order.createdAt);
      const e = byDay.get(key) ?? { units: 0, orders: new Set<string>(), revenue: 0 };
      e.units += it.pickedQty ?? it.orderedQty;
      e.orders.add(it.order.id);
      e.revenue += it.lineTotal;
      byDay.set(key, e);
    }
    const series: DayPoint[] = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, e]) => ({ date, units: round3(e.units), orders: e.orders.size, revenue: e.revenue }));

    const totalUnits = series.reduce((s, p) => s + p.units, 0);
    const totalRevenue = series.reduce((s, p) => s + p.revenue, 0);
    return {
      productId: productSlug,
      days: d,
      series,
      summary: {
        totalUnits: round3(totalUnits),
        totalRevenue,
        activeDays: series.length,
        avgDailyUnits: series.length ? round3(totalUnits / series.length) : 0,
      },
    };
  }

  /**
   * Basit fiyat esnekliği: en son fiyat değişiminin öncesi/sonrası penceresinde
   * ortalama günlük satışları karşılaştırır ("fiyat %-10 → satış %+18").
   * Yeterli veri yoksa available=false döner.
   */
  async elasticity(productSlug: string, windowDays = 14) {
    const w = Math.min(90, Math.max(3, windowDays));
    const product = await this.prisma.product
      .findFirst({ where: { tenantId: DEV_TENANT_ID, slug: productSlug }, select: { id: true } })
      .catch(() => null);
    if (!product) return { available: false, reason: 'Ürün bulunamadı' };

    // Eski fiyatı bilinen en güncel değişiklik.
    const change = await this.prisma.priceHistory.findFirst({
      where: { tenantId: DEV_TENANT_ID, productId: product.id, oldPrice: { not: null } },
      orderBy: { changedAt: 'desc' },
    });
    if (!change || change.oldPrice == null) return { available: false, reason: 'Yeterli fiyat geçmişi yok' };

    const changeAt = change.changedAt;
    const beforeStart = new Date(changeAt.getTime() - w * 86_400_000);
    const afterEnd = new Date(changeAt.getTime() + w * 86_400_000);

    const items = await this.prisma.orderItem.findMany({
      where: {
        productId: product.id,
        order: { tenantId: DEV_TENANT_ID, status: { not: 'CANCELLED' }, createdAt: { gte: beforeStart, lt: afterEnd } },
      },
      select: { orderedQty: true, pickedQty: true, order: { select: { createdAt: true } } },
    });

    let beforeUnits = 0;
    let afterUnits = 0;
    for (const it of items) {
      const u = it.pickedQty ?? it.orderedQty;
      if (it.order.createdAt < changeAt) beforeUnits += u;
      else afterUnits += u;
    }
    const beforeAvg = beforeUnits / w;
    const afterAvg = afterUnits / w;
    const pricePct = (change.newPrice - change.oldPrice) / change.oldPrice;
    const unitsPct = beforeAvg > 0 ? (afterAvg - beforeAvg) / beforeAvg : null;
    const elasticity = unitsPct != null && pricePct !== 0 ? +(unitsPct / pricePct).toFixed(2) : null;

    return {
      available: true,
      windowDays: w,
      changeAt: changeAt.toISOString(),
      oldPrice: change.oldPrice,
      newPrice: change.newPrice,
      pricePct: +pricePct.toFixed(4),
      beforeAvgUnits: round3(beforeAvg),
      afterAvgUnits: round3(afterAvg),
      unitsPct: unitsPct != null ? +unitsPct.toFixed(4) : null,
      elasticity,
    };
  }
}
