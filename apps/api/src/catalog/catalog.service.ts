import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { priceForMargin, DEFAULT_FLOOR_MARGIN } from '../pricing-engine';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { CreateCategoryDto, CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateBasketDto } from './dto/basket.dto';
import { CostComponentsService } from '../intel/cost-components/cost-components.service';
import { PricingRulesService } from '../intel/pricing-rules/pricing-rules.service';

const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly rules: PricingRulesService,
  ) {}

  /**
   * Fiyat güvenlik ağı (katalog kapısı): maliyet verisi varsa, elle yazılan satış
   * fiyatı (indirimli dâhil) taban marjın altına inemez — zararına satış yalnızca
   * Fiyat Öneri Motoru'ndaki bilinçli fırsat akışıyla yapılabilir. Maliyet/hal
   * verisi yoksa kontrol atlanır (doğrulanamaz — publishPopular ile aynı politika).
   */
  private async assertNotBelowFloor(opts: {
    slug: string;
    parts?: { slug: string; qty: number }[];
    basePrice?: number | null;
    discountedPrice?: number | null;
  }) {
    const prices = [opts.basePrice, opts.discountedPrice].filter((p): p is number => p != null && p > 0);
    if (prices.length === 0) return;
    const cost = opts.parts
      ? await this.costs.basketPartsCost(opts.parts).catch(() => null)
      : await this.costs.costForProduct(opts.slug).catch(() => null);
    if (!cost?.breakdown || cost.directCost == null) return;
    const rule = await this.rules.resolveEffective(opts.slug).catch(() => null);
    const floor = Math.round(priceForMargin(cost.breakdown, rule?.floorMargin ?? DEFAULT_FLOOR_MARGIN));
    const lowest = Math.min(...prices);
    if (lowest < floor) {
      throw new BadRequestException(
        `Fiyat güvenli tabanın altında: ${tl(lowest)} < taban ${tl(floor)} (maliyet ${tl(cost.directCost)}). ` +
        `Zararına satış bilinçli bir kararsa Fiyat Öneri Motoru'ndan fırsat ürünü olarak fiyatlayın.`,
      );
    }
  }

  /* ---------------------------- Kategoriler --------------------------- */

  listCategories() {
    return this.prisma.category.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: { tenantId: DEV_TENANT_ID, slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
      });
    } catch (e) {
      throw this.mapDbError(e, 'Kategori');
    }
  }

  /* ------------------------------ Ürünler ----------------------------- */

  async listProducts(opts: { search?: string; categoryId?: string; active?: string }) {
    const where: Prisma.ProductWhereInput = { tenantId: DEV_TENANT_ID };
    if (opts.search) where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { slug: { contains: opts.search, mode: 'insensitive' } },
    ];
    if (opts.categoryId) where.categoryId = opts.categoryId;
    if (opts.active === 'true') where.isActive = true;
    if (opts.active === 'false') where.isActive = false;

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { category: { select: { id: true, name: true } } },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: string) {
    const row = await this.prisma.product
      .findFirst({ where: { id, tenantId: DEV_TENANT_ID }, include: { category: { select: { id: true, name: true } } } })
      .catch(() => null);
    if (!row) throw new NotFoundException(`Ürün bulunamadı: ${id}`);
    return this.toResponse(row);
  }

  async createProduct(dto: CreateProductDto) {
    await this.assertCategory(dto.categoryId);
    await this.assertNotBelowFloor({ slug: dto.slug, basePrice: dto.basePrice, discountedPrice: dto.discountedPrice });
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId: DEV_TENANT_ID,
          slug: dto.slug,
          name: dto.name,
          categoryId: dto.categoryId ?? null,
          saleType: dto.saleType,
          unitLabel: dto.unitLabel ?? null,
          imageUrl: dto.imageUrl ?? null,
          description: dto.description ?? null,
          basePrice: dto.basePrice ?? null,
          discountedPrice: dto.discountedPrice ?? null,
          stockQty: dto.stockQty ?? null,
          maxPerOrder: dto.maxPerOrder ?? null,
          originRegion: dto.originRegion ?? null,
          isActive: dto.isActive ?? true,
          isFeatured: dto.isFeatured ?? false,
          isFreshDaily: dto.isFreshDaily ?? false,
          isLocal: dto.isLocal ?? false,
        },
        include: { category: { select: { id: true, name: true } } },
      });
      return this.toResponse(row);
    } catch (e) {
      throw this.mapDbError(e, 'Ürün');
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto, actor?: string) {
    const current = await this.findOne(id); // 404 kontrolü
    if (dto.categoryId !== undefined) await this.assertCategory(dto.categoryId);
    // Fiyata dokunuluyorsa taban kontrolü (dokunulmayan taraf mevcut değeriyle birleştirilir).
    if (dto.basePrice !== undefined || dto.discountedPrice !== undefined) {
      await this.assertNotBelowFloor({
        slug: current.slug,
        basePrice: dto.basePrice !== undefined ? dto.basePrice : current.basePrice,
        discountedPrice: dto.discountedPrice !== undefined ? dto.discountedPrice : current.discountedPrice,
      });
    }
    const row = await this.prisma.product.update({
      where: { id },
      data: { ...dto },
      include: { category: { select: { id: true, name: true } } },
    });
    // Elle stok değişimi hareket defterine (fark ≠ 0 ise) — takip yeni açılıyorsa eski değer 0 sayılır.
    if (dto.stockQty !== undefined && dto.stockQty !== current.stockQty) {
      const delta = (dto.stockQty ?? 0) - (current.stockQty ?? 0);
      if (delta !== 0) {
        await this.prisma.stockMovement
          .create({ data: { tenantId: DEV_TENANT_ID, productId: id, delta, reason: 'MANUAL', actor: actor ?? null } })
          .catch(() => {});
      }
    }
    return this.toResponse(row);
  }

  /**
   * İkame listesi ata (tümünü değiştirir, sıra = dizideki yer). Kendisi ve
   * bilinmeyen slug reddedilir; en fazla 5 ikame.
   */
  async setSubstitutes(id: string, slugs: string[]) {
    const current = await this.findOne(id);
    const clean = [...new Set((slugs ?? []).map((s) => s?.trim()).filter(Boolean))].slice(0, 5);
    if (clean.includes(current.slug)) throw new BadRequestException('Ürün kendisinin ikamesi olamaz.');
    const subs = await this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, slug: { in: clean } }, select: { id: true, slug: true } });
    const bySlug = new Map(subs.map((p) => [p.slug, p.id]));
    const missing = clean.filter((s) => !bySlug.has(s));
    if (missing.length) throw new BadRequestException(`Ürün bulunamadı: ${missing.join(', ')}`);
    await this.prisma.$transaction([
      this.prisma.productSubstitute.deleteMany({ where: { productId: id } }),
      this.prisma.productSubstitute.createMany({
        data: clean.map((s, i) => ({ tenantId: DEV_TENANT_ID, productId: id, substituteId: bySlug.get(s)!, sortOrder: i })),
      }),
    ]);
    return this.getSubstitutes(id);
  }

  /** Ürünün ikameleri (sıralı, ad/stok/fiyatla). */
  async getSubstitutes(id: string) {
    const rows = await this.prisma.productSubstitute.findMany({
      where: { productId: id, tenantId: DEV_TENANT_ID },
      orderBy: { sortOrder: 'asc' },
      include: { substitute: { select: { slug: true, name: true, unitLabel: true, basePrice: true, discountedPrice: true, stockQty: true, imageUrl: true, isActive: true } } },
    });
    return rows.map((r) => r.substitute);
  }

  /** Stok hareket defteri: son N gün, istenirse tek ürün (slug) için. */
  async stockMovements(opts: { product?: string; days?: number; limit?: number }) {
    const days = Math.min(180, Math.max(1, opts.days ?? 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const where: Prisma.StockMovementWhereInput = { tenantId: DEV_TENANT_ID, createdAt: { gte: since } };
    if (opts.product?.trim()) where.product = { slug: opts.product.trim() };
    const rows = await this.prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, opts.limit ?? 200)),
      include: { product: { select: { slug: true, name: true, unitLabel: true, stockQty: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      product: m.product,
      delta: m.delta,
      reason: m.reason,
      refCode: m.refCode,
      actor: m.actor,
      createdAt: m.createdAt,
    }));
  }

  /** Geçmişi olan ürün silinemez → pasifleştirme önerilir (409). */
  async removeProduct(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.product.delete({ where: { id } });
      return { deleted: true };
    } catch {
      throw new ConflictException('Bu ürünün fiyat geçmişi var; silmek yerine pasifleştirin (isActive=false).');
    }
  }

  /* ---------------------------- Hazır sepetler ------------------------ */

  /** Hazır sepet = ayrı bir ürün (kind=BASKET) + içerik (component'ler). */
  async createBasket(dto: CreateBasketDto) {
    const slugs = [...new Set(dto.components.map((c) => c.productSlug))];
    const comps = await this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, slug: { in: slugs } } });
    const bySlug = new Map(comps.map((p) => [p.slug, p]));
    const components = dto.components.map((c) => {
      const p = bySlug.get(c.productSlug);
      if (!p) throw new BadRequestException(`Ürün bulunamadı: ${c.productSlug}`);
      return { componentId: p.id, qty: c.qty };
    });
    await this.assertNotBelowFloor({
      slug: dto.slug,
      parts: dto.components.map((c) => ({ slug: c.productSlug, qty: c.qty })),
      basePrice: dto.basePrice,
      discountedPrice: dto.discountedPrice,
    });
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId: DEV_TENANT_ID,
          kind: 'BASKET',
          slug: dto.slug,
          name: dto.name,
          saleType: 'PACK',
          unitLabel: 'paket',
          basePrice: dto.basePrice,
          discountedPrice: dto.discountedPrice ?? null,
          stockQty: dto.stockQty ?? null,
          imageUrl: dto.imageUrl ?? null,
          components: { create: components },
        },
        include: this.basketInclude,
      });
      return this.toBasket(row);
    } catch (e) {
      throw this.mapDbError(e, 'Sepet');
    }
  }

  async listBaskets() {
    const rows = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, kind: 'BASKET' },
      orderBy: { name: 'asc' },
      include: this.basketInclude,
    });
    return rows.map((r) => this.toBasket(r));
  }

  /** Sepet silme = ürün silme (geçmişi varsa 409; pasifleştir). */
  removeBasket(id: string) {
    return this.removeProduct(id);
  }

  private readonly basketInclude = {
    components: { include: { component: { select: { slug: true, name: true, unitLabel: true } } } },
  } as const;

  private toBasket(r: {
    id: string; slug: string; name: string; basePrice: number | null; discountedPrice: number | null;
    stockQty: number | null; imageUrl: string | null; isActive: boolean;
    components: { qty: number; component: { slug: string; name: string; unitLabel: string | null } }[];
  }) {
    return {
      id: r.id, slug: r.slug, name: r.name,
      basePrice: r.basePrice, discountedPrice: r.discountedPrice, stockQty: r.stockQty,
      imageUrl: r.imageUrl, isActive: r.isActive,
      components: r.components.map((c) => ({ slug: c.component.slug, name: c.component.name, unitLabel: c.component.unitLabel, qty: c.qty })),
    };
  }

  /* ------------------------------ Yardımcı ---------------------------- */

  private async assertCategory(categoryId?: string) {
    if (!categoryId) return;
    const cat = await this.prisma.category
      .findFirst({ where: { id: categoryId, tenantId: DEV_TENANT_ID } })
      .catch(() => null);
    if (!cat) throw new BadRequestException(`Kategori bulunamadı: ${categoryId}`);
  }

  private mapDbError(e: unknown, label: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`${label} slug zaten kullanımda`);
    }
    return e as Error;
  }

  private toResponse(r: {
    id: string; slug: string; name: string; kind: string; saleType: string; unitLabel: string | null;
    imageUrl: string | null; description: string | null; basePrice: number | null; discountedPrice: number | null;
    stockQty: number | null; maxPerOrder: number | null; originRegion: string | null;
    isActive: boolean; isFeatured: boolean; isFreshDaily: boolean; isLocal: boolean;
    categoryId: string | null; category: { id: string; name: string } | null; updatedAt: Date;
  }) {
    return {
      id: r.id, slug: r.slug, name: r.name, kind: r.kind, saleType: r.saleType, unitLabel: r.unitLabel,
      imageUrl: r.imageUrl, description: r.description, basePrice: r.basePrice, discountedPrice: r.discountedPrice,
      stockQty: r.stockQty, maxPerOrder: r.maxPerOrder, originRegion: r.originRegion,
      isActive: r.isActive, isFeatured: r.isFeatured, isFreshDaily: r.isFreshDaily, isLocal: r.isLocal,
      category: r.category, updatedAt: r.updatedAt.toISOString(),
    };
  }
}
