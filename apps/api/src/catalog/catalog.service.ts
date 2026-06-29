import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { CreateCategoryDto, CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateBasketDto } from './dto/basket.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

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
          basePrice: dto.basePrice ?? null,
          discountedPrice: dto.discountedPrice ?? null,
          stockQty: dto.stockQty ?? null,
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

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.findOne(id); // 404 kontrolü
    if (dto.categoryId !== undefined) await this.assertCategory(dto.categoryId);
    const row = await this.prisma.product.update({
      where: { id },
      data: { ...dto },
      include: { category: { select: { id: true, name: true } } },
    });
    return this.toResponse(row);
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
    imageUrl: string | null; basePrice: number | null; discountedPrice: number | null;
    stockQty: number | null; originRegion: string | null;
    isActive: boolean; isFeatured: boolean; isFreshDaily: boolean; isLocal: boolean;
    categoryId: string | null; category: { id: string; name: string } | null; updatedAt: Date;
  }) {
    return {
      id: r.id, slug: r.slug, name: r.name, kind: r.kind, saleType: r.saleType, unitLabel: r.unitLabel,
      imageUrl: r.imageUrl, basePrice: r.basePrice, discountedPrice: r.discountedPrice,
      stockQty: r.stockQty, originRegion: r.originRegion,
      isActive: r.isActive, isFeatured: r.isFeatured, isFreshDaily: r.isFreshDaily, isLocal: r.isLocal,
      category: r.category, updatedAt: r.updatedAt.toISOString(),
    };
  }
}
