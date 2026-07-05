import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

interface DayPoint { date: string; units: number; orders: number; revenue: number }

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const round3 = (n: number) => +n.toFixed(3);

/** Son N günün YYYY-AA-GG anahtarları (bugün dahil, eskiden yeniye). */
function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  return out;
}

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
   * Mağaza geneli günlük ciro/sipariş serisi (iptaller hariç) — boş günler 0
   * ile doldurulur ki grafikte kesinti görünmesin. Ciro: kesinleşen tutar
   * varsa o (finalTotal), yoksa sipariş anındaki toplam.
   */
  async overview(days = 7) {
    const d = Math.min(90, Math.max(1, days));
    const since = new Date();
    since.setDate(since.getDate() - (d - 1));
    since.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, status: { not: 'CANCELLED' }, createdAt: { gte: since } },
      select: { createdAt: true, grandTotal: true, finalTotal: true, discountTotal: true },
    });

    const byDay = new Map<string, { orders: number; revenue: number; discount: number }>();
    for (const o of orders) {
      const key = dayKey(o.createdAt);
      const e = byDay.get(key) ?? { orders: 0, revenue: 0, discount: 0 };
      e.orders += 1;
      e.revenue += o.finalTotal ?? o.grandTotal;
      e.discount += o.discountTotal;
      byDay.set(key, e);
    }
    const series = lastDays(d).map((date) => ({ date, ...(byDay.get(date) ?? { orders: 0, revenue: 0, discount: 0 }) }));
    const totalOrders = series.reduce((s, p) => s + p.orders, 0);
    const totalRevenue = series.reduce((s, p) => s + p.revenue, 0);
    return {
      days: d,
      series,
      summary: {
        totalOrders,
        totalRevenue,
        totalDiscount: series.reduce((s, p) => s + p.discount, 0),
        avgOrderValue: totalOrders ? Math.round(totalRevenue / totalOrders) : 0,
      },
    };
  }

  /**
   * Fiyat hareketliliği (volatilite): son N günde ürün başına fiyat değişim
   * sayısı + ortalama/toplam mutlak % değişim. En çok/az oynayan ürünleri ve
   * ürün×gün ısı haritasını besler.
   */
  async priceMovers(days = 30) {
    const d = Math.min(180, Math.max(1, days));
    const since = new Date(Date.now() - d * 86_400_000);

    const changes = await this.prisma.priceHistory.findMany({
      where: { tenantId: DEV_TENANT_ID, changedAt: { gte: since }, oldPrice: { not: null } },
      select: { productId: true, oldPrice: true, newPrice: true, changedAt: true, product: { select: { slug: true, name: true } } },
      orderBy: { changedAt: 'asc' },
    });

    interface Mover {
      slug: string; name: string; changes: number; avgAbsPct: number; netPct: number;
      firstPrice: number; lastPrice: number; byDay: Record<string, number>;
    }
    const byProduct = new Map<string, Mover & { sumAbsPct: number }>();
    for (const c of changes) {
      const old = c.oldPrice as number;
      if (old <= 0) continue;
      const pct = (c.newPrice - old) / old;
      const e = byProduct.get(c.productId) ?? {
        slug: c.product.slug, name: c.product.name, changes: 0, sumAbsPct: 0, avgAbsPct: 0, netPct: 0,
        firstPrice: old, lastPrice: c.newPrice, byDay: {},
      };
      e.changes += 1;
      e.sumAbsPct += Math.abs(pct);
      e.lastPrice = c.newPrice;
      const day = dayKey(c.changedAt);
      e.byDay[day] = (e.byDay[day] ?? 0) + 1;
      byProduct.set(c.productId, e);
    }

    const movers = [...byProduct.values()]
      .map((e) => ({
        slug: e.slug, name: e.name, changes: e.changes,
        avgAbsPct: +(e.sumAbsPct / e.changes).toFixed(4),
        netPct: e.firstPrice > 0 ? +((e.lastPrice - e.firstPrice) / e.firstPrice).toFixed(4) : 0,
        firstPrice: e.firstPrice, lastPrice: e.lastPrice, byDay: e.byDay,
      }))
      .sort((a, b) => b.changes - a.changes || b.avgAbsPct - a.avgAbsPct);

    const totalProducts = await this.prisma.product.count({ where: { tenantId: DEV_TENANT_ID } });
    return {
      days: d,
      dayKeys: lastDays(d),
      movers,
      summary: {
        changedProducts: movers.length,
        unchangedProducts: Math.max(0, totalProducts - movers.length),
        totalChanges: changes.length,
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
