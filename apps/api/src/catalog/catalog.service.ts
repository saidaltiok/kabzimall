import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { CreateCategoryDto, CreateProductDto, UpdateProductDto } from './dto/product.dto';

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
          basePrice: dto.basePrice ?? null,
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
    id: string; slug: string; name: string; saleType: string; unitLabel: string | null;
    basePrice: number | null; originRegion: string | null; isActive: boolean; isFeatured: boolean;
    isFreshDaily: boolean; isLocal: boolean; categoryId: string | null;
    category: { id: string; name: string } | null; updatedAt: Date;
  }) {
    return {
      id: r.id, slug: r.slug, name: r.name, saleType: r.saleType, unitLabel: r.unitLabel,
      basePrice: r.basePrice, originRegion: r.originRegion,
      isActive: r.isActive, isFeatured: r.isFeatured, isFreshDaily: r.isFreshDaily, isLocal: r.isLocal,
      category: r.category, updatedAt: r.updatedAt.toISOString(),
    };
  }
}
