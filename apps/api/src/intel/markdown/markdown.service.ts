import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CostComponentsService } from '../cost-components/cost-components.service';
import { effectivePrice } from '../../pricing-engine';

export interface MarkdownRuleInput {
  scope: 'CATEGORY' | 'PRODUCT';
  refId: string;
  mode?: 'PRICE_DECAY' | 'MARGIN_DECAY' | 'EXCLUDE';
  pct?: number;
  staleDays?: number;
  allowBelowCost?: boolean;
  maxTotalOffPct?: number;
  isActive?: boolean;
}

export interface MarkdownAction {
  slug: string; name: string; category: string | null;
  daysStale: number; oldPrice: number; newPrice: number;
  mode: string; floored: 'COST' | 'CAP' | null; // hangi tabana çarptı
}

/** 10 kuruşa yuvarla — vitrin fiyatı köşeli görünmesin. */
const round10 = (k: number) => Math.round(k / 10) * 10;
const DAY = 86_400_000;

/**
 * Otomatik indirim (clearance): yeni alım yapılmayan ama stoğu süren ürünlerin
 * fiyatını her gün kurala göre düşürür (discountedPrice'a yazar → Fırsatlar
 * rafına otomatik düşer). Restok gelince işaretli indirim temizlenir.
 * Taban fiyat (basePrice) DEĞİŞMEZ — indirim her zaman ona göre gösterilir.
 */
@Injectable()
export class MarkdownService {
  private readonly logger = new Logger('Markdown');

  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
  ) {}

  /* ------------------------------- Kurallar ------------------------------- */

  listRules() {
    return this.prisma.markdownRule.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: [{ scope: 'asc' }, { refId: 'asc' }] });
  }

  private validate(dto: MarkdownRuleInput) {
    if (!['CATEGORY', 'PRODUCT'].includes(dto.scope)) throw new BadRequestException('scope CATEGORY ya da PRODUCT olmalı.');
    if (!dto.refId?.trim()) throw new BadRequestException('refId (slug) zorunlu.');
    const mode = dto.mode ?? 'PRICE_DECAY';
    if (!['PRICE_DECAY', 'MARGIN_DECAY', 'EXCLUDE'].includes(mode)) throw new BadRequestException('mode geçersiz.');
    if (mode !== 'EXCLUDE') {
      const pct = dto.pct ?? 0.05;
      if (pct <= 0 || pct >= 1) throw new BadRequestException('pct 0-1 arası olmalı (ör. 0.05 = %5/gün).');
      const cap = dto.maxTotalOffPct ?? 0.5;
      if (cap <= 0 || cap >= 1) throw new BadRequestException('maxTotalOffPct 0-1 arası olmalı.');
      if ((dto.staleDays ?? 2) < 1) throw new BadRequestException('staleDays en az 1 olmalı.');
    }
  }

  /** Kural ekle/güncelle (scope+refId benzersiz — upsert). */
  async upsertRule(dto: MarkdownRuleInput) {
    this.validate(dto);
    const refId = dto.refId.trim();
    return this.prisma.markdownRule.upsert({
      where: { tenantId_scope_refId: { tenantId: DEV_TENANT_ID, scope: dto.scope, refId } },
      create: {
        tenantId: DEV_TENANT_ID, scope: dto.scope, refId,
        mode: dto.mode ?? 'PRICE_DECAY', pct: dto.pct ?? 0.05, staleDays: dto.staleDays ?? 2,
        allowBelowCost: dto.allowBelowCost ?? false, maxTotalOffPct: dto.maxTotalOffPct ?? 0.5,
        isActive: dto.isActive ?? true,
      },
      update: {
        ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
        ...(dto.pct !== undefined ? { pct: dto.pct } : {}),
        ...(dto.staleDays !== undefined ? { staleDays: dto.staleDays } : {}),
        ...(dto.allowBelowCost !== undefined ? { allowBelowCost: dto.allowBelowCost } : {}),
        ...(dto.maxTotalOffPct !== undefined ? { maxTotalOffPct: dto.maxTotalOffPct } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeRule(id: string) {
    const r = await this.prisma.markdownRule.deleteMany({ where: { id, tenantId: DEV_TENANT_ID } });
    if (r.count === 0) throw new NotFoundException('Kural bulunamadı.');
    return { deleted: true };
  }

  /**
   * Yaklaşan erimeler: bugün inecekler + 2 gün içinde eriyecekler. Bugün
   * ekranında gösterilir ki hal alımı/stok girişi unutulduğunda otomatik
   * indirim sürpriz olmasın ("yarın 12 ürün inmeye başlayacak" uyarısı).
   */
  async upcoming() {
    const now = Date.now();
    const [rules, products] = await Promise.all([
      this.prisma.markdownRule.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true } }),
      this.prisma.product.findMany({
        where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE', isActive: true, basePrice: { gt: 0 }, stockQty: { gt: 0 } },
        select: { id: true, slug: true, name: true, createdAt: true },
      }),
    ]);
    if (rules.length === 0 || products.length === 0) return { today: [], soon: [] };
    const byProduct = new Map(rules.filter((r) => r.scope === 'PRODUCT').map((r) => [r.refId, r]));
    const byCategory = new Map(rules.filter((r) => r.scope === 'CATEGORY').map((r) => [r.refId, r]));
    const cats = await this.prisma.product.findMany({
      where: { id: { in: products.map((p) => p.id) } },
      select: { id: true, category: { select: { slug: true } } },
    });
    const catOf = new Map(cats.map((c) => [c.id, c.category?.slug]));

    const slugs = products.map((p) => p.slug);
    const ids = products.map((p) => p.id);
    const [purchases, stockIns] = await Promise.all([
      this.prisma.halPurchase.groupBy({ by: ['productSlug'], where: { tenantId: DEV_TENANT_ID, productSlug: { in: slugs } }, _max: { createdAt: true } }),
      this.prisma.stockMovement.groupBy({ by: ['productId'], where: { tenantId: DEV_TENANT_ID, productId: { in: ids }, delta: { gt: 0 } }, _max: { createdAt: true } }),
    ]);
    const lastPurchase = new Map(purchases.map((x) => [x.productSlug as string, x._max.createdAt!.getTime()]));
    const lastStockIn = new Map(stockIns.map((x) => [x.productId, x._max.createdAt!.getTime()]));

    const today: { slug: string; name: string; daysStale: number }[] = [];
    const soon: { slug: string; name: string; inDays: number }[] = [];
    for (const p of products) {
      const rule = byProduct.get(p.slug) ?? (catOf.get(p.id) ? byCategory.get(catOf.get(p.id)!) : undefined);
      if (!rule || rule.mode === 'EXCLUDE') continue;
      const lastSupply = Math.max(lastPurchase.get(p.slug) ?? 0, lastStockIn.get(p.id) ?? 0, p.createdAt.getTime());
      const daysStale = Math.floor((now - lastSupply) / DAY);
      const until = rule.staleDays - daysStale;
      if (until <= 0) today.push({ slug: p.slug, name: p.name, daysStale });
      else if (until <= 2) soon.push({ slug: p.slug, name: p.name, inDays: until });
    }
    return { today, soon };
  }

  /* ------------------------------ Günlük koşu ------------------------------ */

  /** Sabah 08:30 (İstanbul) — hal alımı işlendikten sonra, vitrin açılmadan. */
  @Cron('30 8 * * *', { timeZone: 'Europe/Istanbul' })
  async cronRun() {
    try {
      const r = await this.run(false);
      this.logger.log(`Otomatik indirim: ${r.applied.length} indirim, ${r.cleared.length} temizleme.`);
    } catch (e) {
      this.logger.error(`Otomatik indirim koşusu başarısız: ${(e as Error).message}`);
    }
  }

  /**
   * dryRun=true → yalnız önizleme (hiçbir şey yazılmaz).
   * Kapsam: SIMPLE + aktif + fiyatlı + stok takipli ve stoğu > 0 ürünler.
   */
  async run(dryRun: boolean) {
    const now = Date.now();
    const [rules, products] = await Promise.all([
      this.prisma.markdownRule.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true } }),
      this.prisma.product.findMany({
        where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE', isActive: true, basePrice: { gt: 0 } },
        select: {
          id: true, slug: true, name: true, createdAt: true, basePrice: true, discountedPrice: true,
          stockQty: true, markdownAt: true, category: { select: { slug: true, name: true } },
        },
      }),
    ]);
    const byProduct = new Map(rules.filter((r) => r.scope === 'PRODUCT').map((r) => [r.refId, r]));
    const byCategory = new Map(rules.filter((r) => r.scope === 'CATEGORY').map((r) => [r.refId, r]));

    // Son tedarik anları (tek sorguda): hal alımı + pozitif stok hareketi.
    const slugs = products.map((p) => p.slug);
    const ids = products.map((p) => p.id);
    const [purchases, stockIns] = await Promise.all([
      this.prisma.halPurchase.groupBy({ by: ['productSlug'], where: { tenantId: DEV_TENANT_ID, productSlug: { in: slugs } }, _max: { createdAt: true } }),
      this.prisma.stockMovement.groupBy({ by: ['productId'], where: { tenantId: DEV_TENANT_ID, productId: { in: ids }, delta: { gt: 0 } }, _max: { createdAt: true } }),
    ]);
    const lastPurchase = new Map(purchases.map((x) => [x.productSlug as string, x._max.createdAt!.getTime()]));
    const lastStockIn = new Map(stockIns.map((x) => [x.productId, x._max.createdAt!.getTime()]));

    const applied: MarkdownAction[] = [];
    const cleared: { slug: string; name: string }[] = [];
    const todayKey = new Date().toISOString().slice(0, 10);

    for (const p of products) {
      // En-spesifik kural: PRODUCT > CATEGORY; yoksa/EXCLUDE ise kapsam dışı.
      const rule = byProduct.get(p.slug) ?? (p.category ? byCategory.get(p.category.slug) : undefined);
      if (!rule || rule.mode === 'EXCLUDE') continue;

      const lastSupply = Math.max(lastPurchase.get(p.slug) ?? 0, lastStockIn.get(p.id) ?? 0, p.createdAt.getTime());
      const daysStale = Math.floor((now - lastSupply) / DAY);
      const isStale = daysStale >= rule.staleDays;
      const tracked = p.stockQty != null && p.stockQty > 0; // stok bilinmiyor ya da bittiyse dokunma

      // Restok/tükenme: işaret bizdeyse indirimi temizle, fiyat normale dönsün.
      if (p.markdownAt != null && (!isStale || !tracked)) {
        if (!dryRun) {
          await this.prisma.product.update({ where: { id: p.id }, data: { discountedPrice: null, markdownAt: null } });
        }
        cleared.push({ slug: p.slug, name: p.name });
        continue;
      }
      if (!isStale || !tracked) continue;

      // Günde bir kez uygula (koşu tekrarına dayanıklı).
      if (p.markdownAt && p.markdownAt.toISOString().slice(0, 10) === todayKey) continue;

      const base = p.basePrice!;
      const current = effectivePrice(base, p.discountedPrice);
      const cost = await this.costs.costForProduct(p.slug).catch(() => null);
      const directCost = cost?.directCost ?? null;

      let next: number;
      if (rule.mode === 'MARGIN_DECAY') {
        if (directCost == null || current <= directCost) continue; // kar bilinmiyor/kalmadı → bu modda inilemez
        next = directCost + Math.round((current - directCost) * (1 - rule.pct));
      } else {
        next = Math.round(current * (1 - rule.pct));
      }

      // Tabanlar: toplam indirim tavanı + (izin yoksa) maliyet.
      let floored: MarkdownAction['floored'] = null;
      const capFloor = Math.round(base * (1 - rule.maxTotalOffPct));
      if (next < capFloor) { next = capFloor; floored = 'CAP'; }
      if (!rule.allowBelowCost && directCost != null && next < directCost) { next = directCost; floored = 'COST'; }
      next = round10(next);
      if (next <= 0 || next >= current) continue; // düşüş yoksa dokunma

      if (!dryRun) {
        await this.prisma.product.update({ where: { id: p.id }, data: { discountedPrice: next, markdownAt: new Date() } });
      }
      applied.push({ slug: p.slug, name: p.name, category: p.category?.name ?? null, daysStale, oldPrice: current, newPrice: next, mode: rule.mode, floored });
    }

    return { dryRun, applied, cleared, ranAt: new Date().toISOString() };
  }
}
