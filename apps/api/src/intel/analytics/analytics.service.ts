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
   * İdeal sepet önerisi (PRD Faz 2): sipariş verisinden birlikte-satın-alma
   * analizi. En sık birlikte alınan ürün çiftleri + en popüler üründen
   * açgözlü (greedy) genişletmeyle önerilen sepet bileşimi döner.
   */
  async basketAffinity(days = 90) {
    const d = Math.min(365, Math.max(7, days));
    const since = new Date(Date.now() - d * 86_400_000);

    const orders = await this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, status: { not: 'CANCELLED' }, createdAt: { gte: since } },
      select: { items: { select: { product: { select: { slug: true, name: true, kind: true } } } } },
    });

    // Sipariş başına tekil ürünler (hazır sepetler analiz dışı — kendileri zaten paket).
    const perOrder = orders
      .map((o) => [...new Map(o.items.filter((i) => i.product.kind !== 'BASKET').map((i) => [i.product.slug, i.product])).values()])
      .filter((items) => items.length > 0);

    const productCount = new Map<string, { slug: string; name: string; orders: number }>();
    const pairCount = new Map<string, { a: string; b: string; together: number }>();
    for (const items of perOrder) {
      for (const p of items) {
        const e = productCount.get(p.slug) ?? { slug: p.slug, name: p.name, orders: 0 };
        e.orders += 1;
        productCount.set(p.slug, e);
      }
      const slugs = items.map((p) => p.slug).sort();
      for (let i = 0; i < slugs.length; i++) {
        for (let j = i + 1; j < slugs.length; j++) {
          const key = `${slugs[i]}|${slugs[j]}`;
          const e = pairCount.get(key) ?? { a: slugs[i], b: slugs[j], together: 0 };
          e.together += 1;
          pairCount.set(key, e);
        }
      }
    }

    const nameOf = (slug: string) => productCount.get(slug)?.name ?? slug;
    const pairs = [...pairCount.values()]
      .filter((p) => p.together >= 2) // tek tesadüf çift sayılmaz
      .sort((x, y) => y.together - x.together)
      .slice(0, 10)
      .map((p) => ({
        a: { slug: p.a, name: nameOf(p.a) },
        b: { slug: p.b, name: nameOf(p.b) },
        together: p.together,
        // birliktelik oranı: çift, iki üründen az geçenin siparişlerinin yüzde kaçında?
        confidence: +(p.together / Math.min(productCount.get(p.a)!.orders, productCount.get(p.b)!.orders)).toFixed(2),
      }));

    // Önerilen sepet: en güçlü çiftten başla (popüler ürün hiçbir çifte girmemiş
    // olabilir), kümeyle birlikteliği en yüksek ürünü ekleyerek 4'e tamamla (greedy).
    const popular = [...productCount.values()].sort((x, y) => y.orders - x.orders);
    const suggested: { slug: string; name: string }[] = [];
    if (pairs.length > 0) {
      suggested.push({ slug: pairs[0].a.slug, name: pairs[0].a.name }, { slug: pairs[0].b.slug, name: pairs[0].b.name });
      while (suggested.length < 4) {
        const inSet = new Set(suggested.map((s) => s.slug));
        let best: { slug: string; score: number } | null = null;
        for (const p of pairCount.values()) {
          const [inside, outside] = inSet.has(p.a) ? [p.a, p.b] : inSet.has(p.b) ? [p.b, p.a] : [null, null];
          if (!inside || !outside || inSet.has(outside)) continue;
          if (!best || p.together > best.score) best = { slug: outside, score: p.together };
        }
        if (!best || best.score < 2) break;
        suggested.push({ slug: best.slug, name: nameOf(best.slug) });
      }
    }

    return {
      days: d,
      ordersAnalyzed: perOrder.length,
      topProducts: popular.slice(0, 8).map((p) => ({ slug: p.slug, name: p.name, orders: p.orders })),
      pairs,
      suggestedBasket: suggested.length >= 2 ? suggested : [],
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
