import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

/**
 * Fiyatlama Kokpiti — fiyatlamanın ESAS dayanağı BENİM hal alış fiyatım.
 * Hal piyasa fiyatı ve rakip fiyatları FİKİR verir. Bir ekranda:
 *  - benim alışım (hal_purchases: ödenen ÷ gerçek kg),
 *  - hal piyasa ortalaması (hal_price_entries),
 *  - rakip ortalaması (competitor_price_entries),
 *  - benim satış fiyatım (product.base/discounted),
 * ve yüzdesel ilişkiler: alışım hal'e göre %kaç, rakip hal'e göre %kaç kâr,
 * satışım alışıma göre %kaç kâr, satışım rakibe göre nerede.
 */
@Injectable()
export class PricingCockpitService {
  constructor(private readonly prisma: PrismaService) {}

  private since(days: number) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }
  private pct(part: number | null, base: number | null): number | null {
    if (part == null || base == null || base === 0) return null;
    return Math.round(((part - base) / base) * 1000) / 10; // bir ondalık
  }
  private avg(nums: number[]): number | null {
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  }

  /** Kokpit tablosu: veriye sahip her ürün için özet metrikler. */
  async overview(days = 30) {
    const from = this.since(days);
    const [products, purchases, halRows, compRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' },
        select: { slug: true, name: true, unitLabel: true, basePrice: true, discountedPrice: true, category: { select: { name: true } } },
      }),
      this.prisma.halPurchase.findMany({
        where: { tenantId: DEV_TENANT_ID, productSlug: { not: null }, createdAt: { gte: from } },
        select: { productSlug: true, recordedKg: true, actualKg: true, totalPaid: true },
      }),
      this.prisma.halPriceEntry.findMany({
        where: { tenantId: DEV_TENANT_ID, date: { gte: from } },
        select: { productSlug: true, price: true },
      }),
      this.prisma.competitorPriceEntry.findMany({
        where: { tenantId: DEV_TENANT_ID, date: { gte: from } },
        select: { productSlug: true, price: true },
      }),
    ]);

    // Ürün başına benim ort. alış birim fiyatı = toplam ödenen ÷ toplam gerçek kg.
    const buyBySlug = new Map<string, { paid: number; kg: number }>();
    for (const p of purchases) {
      const s = p.productSlug!;
      const cur = buyBySlug.get(s) ?? { paid: 0, kg: 0 };
      cur.paid += p.totalPaid;
      cur.kg += p.actualKg ?? p.recordedKg;
      buyBySlug.set(s, cur);
    }
    const halBySlug = new Map<string, number[]>();
    for (const h of halRows) (halBySlug.get(h.productSlug) ?? halBySlug.set(h.productSlug, []).get(h.productSlug)!).push(h.price);
    const compBySlug = new Map<string, number[]>();
    for (const c of compRows) (compBySlug.get(c.productSlug) ?? compBySlug.set(c.productSlug, []).get(c.productSlug)!).push(c.price);

    const rows = products.map((p) => {
      const b = buyBySlug.get(p.slug);
      const myBuy = b && b.kg > 0 ? Math.round(b.paid / b.kg) : null;
      const halAvg = this.avg(halBySlug.get(p.slug) ?? []);
      const compAvg = this.avg(compBySlug.get(p.slug) ?? []);
      const sell = p.discountedPrice != null && p.basePrice != null && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
      return {
        slug: p.slug, name: p.name, unitLabel: p.unitLabel, category: p.category?.name ?? null,
        myBuy, halAvg, compAvg, sell,
        buyVsHalPct: this.pct(myBuy, halAvg),      // alışım hal'e göre (− = ucuza alıyorum)
        compVsHalPct: this.pct(compAvg, halAvg),   // rakip hal'e göre kâr
        sellVsBuyPct: this.pct(sell, myBuy),       // satışım alışıma göre kâr
        sellVsCompPct: this.pct(sell, compAvg),    // satışım rakibe göre (+ = pahalıyım)
      };
    }).filter((r) => r.myBuy != null || r.halAvg != null || r.compAvg != null); // en az bir veri olan ürünler

    // En "aksiyonluk" üstte: satış-alış marjı düşük olan (kâr sıkışması) önce.
    rows.sort((a, b) => (a.sellVsBuyPct ?? 9999) - (b.sellVsBuyPct ?? 9999));
    return { days, from: from.toISOString().slice(0, 10), rows };
  }

  /** Tek ürün: günlük seri (benim alışım / hal / rakip) — trend grafiği. */
  async series(slug: string, days = 30) {
    const from = this.since(days);
    const [purchases, halRows, compRows, product] = await Promise.all([
      this.prisma.halPurchase.findMany({ where: { tenantId: DEV_TENANT_ID, productSlug: slug, createdAt: { gte: from } }, select: { recordedKg: true, actualKg: true, totalPaid: true, createdAt: true } }),
      this.prisma.halPriceEntry.findMany({ where: { tenantId: DEV_TENANT_ID, productSlug: slug, date: { gte: from } }, select: { price: true, date: true } }),
      this.prisma.competitorPriceEntry.findMany({ where: { tenantId: DEV_TENANT_ID, productSlug: slug, date: { gte: from } }, select: { price: true, date: true } }),
      this.prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug }, select: { name: true, unitLabel: true } }),
    ]);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const map = new Map<string, { buyPaid: number; buyKg: number; hal: number[]; comp: number[] }>();
    const get = (k: string) => map.get(k) ?? map.set(k, { buyPaid: 0, buyKg: 0, hal: [], comp: [] }).get(k)!;
    for (const p of purchases) { const g = get(key(p.createdAt)); g.buyPaid += p.totalPaid; g.buyKg += p.actualKg ?? p.recordedKg; }
    for (const h of halRows) get(key(h.date)).hal.push(h.price);
    for (const c of compRows) get(key(c.date)).comp.push(c.price);
    const series = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({
      date,
      myBuy: v.buyKg > 0 ? Math.round(v.buyPaid / v.buyKg) : null,
      hal: this.avg(v.hal),
      comp: this.avg(v.comp),
    }));
    return { slug, name: product?.name ?? slug, unitLabel: product?.unitLabel ?? null, days, series };
  }
}
