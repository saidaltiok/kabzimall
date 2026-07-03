import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { avg, median, stddev, competitionIndex, effectivePrice } from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { dateOnly } from '../../common/date';
import { CreateCompetitorGroupDto } from './dto/create-competitor-group.dto';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { CreateCompetitorPriceDto } from './dto/create-competitor-price.dto';

export interface CompetitorPricesResult {
  productId: string;
  date: string;
  count: number;
  /** Tümü kuruş; rakip yoksa null. */
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  /** Fiyat dağılımının standart sapması (kuruş). */
  stdDev: number | null;
  /** Bizim güncel efektif satış fiyatımız (kuruş; fiyatsızsa null). */
  ourPrice: number | null;
  /** Rekabet endeksi: 100 = rakip ort. ile eşit, >100 pahalı, <100 ucuz. */
  competitionIndex: number | null;
  /** Grup bazlı ortalama (Premium/İndirim… kırılımı). */
  byGroup: { group: string; count: number; average: number }[];
  /** Rakip başına EN GÜNCEL fiyat (aggregate bunlar üzerinden). */
  entries: {
    competitorId: string;
    competitor: string;
    group: string;
    price: number;
    capturedAt: string;
  }[];
}

@Injectable()
export class CompetitorsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ----------------------------- Gruplar ----------------------------- */

  createGroup(dto: CreateCompetitorGroupDto) {
    return this.prisma.competitorGroup.create({
      data: { tenantId: DEV_TENANT_ID, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  listGroups() {
    return this.prisma.competitorGroup.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /* ---------------------------- Rakipler ----------------------------- */

  async createCompetitor(dto: CreateCompetitorDto) {
    const group = await this.prisma.competitorGroup
      .findFirst({ where: { id: dto.groupId, tenantId: DEV_TENANT_ID } })
      .catch(() => null);
    if (!group) throw new NotFoundException(`Rakip grubu bulunamadı: ${dto.groupId}`);

    return this.prisma.competitor.create({
      data: {
        tenantId: DEV_TENANT_ID,
        name: dto.name,
        groupId: dto.groupId,
        type: dto.type ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async listCompetitors() {
    const rows = await this.prisma.competitor.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: { name: 'asc' },
      include: { group: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      isActive: r.isActive,
      group: { id: r.groupId, name: r.group.name },
    }));
  }

  /* ------------------------- Rakip fiyatları -------------------------- */

  async createPrice(dto: CreateCompetitorPriceDto) {
    const competitor = await this.prisma.competitor
      .findFirst({ where: { id: dto.competitorId, tenantId: DEV_TENANT_ID } })
      .catch(() => null);
    if (!competitor) throw new NotFoundException(`Rakip bulunamadı: ${dto.competitorId}`);

    return this.prisma.competitorPriceEntry.create({
      data: {
        tenantId: DEV_TENANT_ID,
        productSlug: dto.productId,
        competitorId: dto.competitorId,
        price: dto.price,
        source: dto.source ?? null,
        date: dateOnly(dto.date),
        capturedBy: dto.capturedBy ?? null,
      },
    });
  }

  /**
   * Bir ürünün belirli güne ait rakip fiyatları + min/max/avg/median.
   * Aggregate, rakip başına EN GÜNCEL fiyat üzerinden hesaplanır (mükerrer
   * yakalama tek rakibi iki saymasın). avg/median packages/pricing'ten.
   */
  async pricesFor(productId: string, dateStr?: string): Promise<CompetitorPricesResult> {
    const date = dateOnly(dateStr);
    const rows = await this.prisma.competitorPriceEntry.findMany({
      where: { tenantId: DEV_TENANT_ID, productSlug: productId, date },
      orderBy: { capturedAt: 'asc' },
      include: { competitor: { include: { group: true } } },
    });

    // asc sırada son yazan = en güncel.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) latest.set(r.competitorId, r);
    const list = [...latest.values()];
    const prices = list.map((r) => r.price);

    // Bizim güncel fiyatımız → rekabet endeksi.
    const product = await this.prisma.product
      .findFirst({ where: { tenantId: DEV_TENANT_ID, slug: productId }, select: { basePrice: true, discountedPrice: true } })
      .catch(() => null);
    const ourPrice = product?.basePrice != null ? effectivePrice(product.basePrice, product.discountedPrice) : null;
    const competitorObjs = list.map((r) => ({ name: r.competitor.name, group: r.competitor.group.name, price: r.price }));

    // Grup bazlı ortalama.
    const groups = new Map<string, number[]>();
    for (const r of list) {
      const g = r.competitor.group.name;
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(r.price);
    }
    const byGroup = [...groups.entries()]
      .map(([group, ps]) => ({ group, count: ps.length, average: Math.round(avg(ps)) }))
      .sort((a, b) => a.group.localeCompare(b.group, 'tr'));

    return {
      productId,
      date: date.toISOString().slice(0, 10),
      count: list.length,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      average: prices.length ? Math.round(avg(prices)) : null,
      median: prices.length ? Math.round(median(prices)) : null,
      stdDev: prices.length ? Math.round(stddev(prices)) : null,
      ourPrice,
      competitionIndex: ourPrice != null ? competitionIndex(ourPrice, competitorObjs) : null,
      byGroup,
      entries: list.map((r) => ({
        competitorId: r.competitorId,
        competitor: r.competitor.name,
        group: r.competitor.group.name,
        price: r.price,
        capturedAt: r.capturedAt.toISOString(),
      })),
    };
  }

  /* -------------------- Kapsam (kesişim) & yayın -------------------- */

  /** Ürün başına rakip fiyatı EN GÜNCEL kayıtları (competitorId → price). */
  private async latestByProduct(slugs?: string[]): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.competitorPriceEntry.findMany({
      where: { tenantId: DEV_TENANT_ID, ...(slugs?.length ? { productSlug: { in: slugs } } : {}) },
      orderBy: { capturedAt: 'asc' },
      select: { productSlug: true, competitorId: true, price: true },
    });
    const bySlug = new Map<string, Map<string, number>>();
    for (const e of rows) {
      let m = bySlug.get(e.productSlug);
      if (!m) { m = new Map(); bySlug.set(e.productSlug, m); }
      m.set(e.competitorId, e.price); // asc → son yazan en güncel
    }
    return bySlug;
  }

  /**
   * Rakip kapsam analizi: her ürün kaç farklı rakipte fiyatlı (kesişim gücü).
   * "En çok tercih edilenler" = en çok rakipte bulunanlar. Yayın kararına baz.
   */
  async coverage() {
    const bySlug = await this.latestByProduct();
    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' },
      select: { slug: true, name: true, isActive: true, basePrice: true, discountedPrice: true },
    });
    const pmap = new Map(products.map((p) => [p.slug, p]));
    const rows = [...bySlug.entries()].flatMap(([slug, cmap]) => {
      const p = pmap.get(slug);
      if (!p) return [];
      const prices = [...cmap.values()];
      return [{
        slug,
        name: p.name,
        coverage: cmap.size,
        minComp: Math.min(...prices),
        medianComp: Math.round(median(prices)),
        ourPrice: p.basePrice != null ? effectivePrice(p.basePrice, p.discountedPrice) : null,
        isActive: p.isActive,
      }];
    });
    rows.sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name, 'tr'));
    const totalCompetitors = await this.prisma.competitor.count({ where: { tenantId: DEV_TENANT_ID, isActive: true } });
    return { totalCompetitors, rows };
  }

  /**
   * Yayına al: verilen ürünleri aktifle + rakip fiyatına göre başlangıç satış
   * fiyatı ata (basis: median=rakip medyanı, min=en düşük). Fiyat 0,50₺'ye yuvarlanır.
   * Rakip fiyatı olmayan slug atlanır.
   */
  async publishPopular(slugs: string[], basis: 'median' | 'min' = 'median') {
    if (!Array.isArray(slugs) || slugs.length === 0) throw new BadRequestException('slugs gerekli');
    const bySlug = await this.latestByProduct(slugs);
    let published = 0;
    const details: { slug: string; price?: number; coverage?: number; skipped?: string }[] = [];
    for (const slug of slugs) {
      const cmap = bySlug.get(slug);
      if (!cmap || cmap.size === 0) { details.push({ slug, skipped: 'rakip fiyatı yok' }); continue; }
      const prices = [...cmap.values()];
      const raw = basis === 'min' ? Math.min(...prices) : Math.round(median(prices));
      const price = Math.max(50, Math.round(raw / 50) * 50); // 0,50₺ yuvarla
      await this.prisma.product.update({
        where: { tenantId_slug: { tenantId: DEV_TENANT_ID, slug } },
        data: { isActive: true, basePrice: price },
      });
      published++;
      details.push({ slug, price, coverage: cmap.size });
    }
    return { published, basis, details };
  }
}
