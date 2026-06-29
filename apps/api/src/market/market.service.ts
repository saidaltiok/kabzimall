import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { deliveryFee, lineTotal } from '../pricing-engine';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { CreateOrderDto } from './dto/create-order.dto';

/** Müşteriye açık ürün alanları (maliyet/marj ASLA sızmaz). */
const PUBLIC_PRODUCT_SELECT = {
  slug: true,
  name: true,
  saleType: true,
  unitLabel: true,
  basePrice: true,
  originRegion: true,
  isFeatured: true,
  isFreshDaily: true,
  isLocal: true,
  category: { select: { slug: true, name: true } },
} as const;

export const ORDER_STATUSES = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  /* ----------------------------- Vitrin ------------------------------ */

  listCategories() {
    return this.prisma.category.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
    });
  }

  listProducts(opts: { search?: string; category?: string }) {
    return this.prisma.product.findMany({
      where: {
        tenantId: DEV_TENANT_ID,
        isActive: true,
        basePrice: { not: null }, // fiyatı olmayan ürün vitrine çıkmaz
        ...(opts.search
          ? { OR: [{ name: { contains: opts.search, mode: 'insensitive' } }, { slug: { contains: opts.search, mode: 'insensitive' } }] }
          : {}),
        ...(opts.category ? { category: { slug: opts.category } } : {}),
      },
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
      select: PUBLIC_PRODUCT_SELECT,
    });
  }

  async getProduct(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { tenantId: DEV_TENANT_ID, slug, isActive: true },
      select: PUBLIC_PRODUCT_SELECT,
    });
    if (!p) throw new NotFoundException(`Ürün bulunamadı: ${slug}`);
    return p;
  }

  /* ----------------------------- Sipariş ----------------------------- */

  async createOrder(dto: CreateOrderDto) {
    // Fiyatlar SUNUCUDA, anlık base_price'tan hesaplanır (istemciye güvenilmez).
    const slugs = [...new Set(dto.items.map((i) => i.slug))];
    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, slug: { in: slugs }, isActive: true },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const items = dto.items.map((i) => {
      const p = bySlug.get(i.slug);
      if (!p) throw new BadRequestException(`Ürün bulunamadı veya yayında değil: ${i.slug}`);
      if (p.basePrice == null) throw new BadRequestException(`Ürün fiyatlandırılmamış: ${i.slug}`);
      return {
        productId: p.id,
        productName: p.name,
        unitLabel: p.unitLabel,
        unitPrice: p.basePrice,
        orderedQty: i.qty,
        lineTotal: lineTotal(p.basePrice, i.qty),
      };
    });

    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const fee = deliveryFee(subtotal);
    const grandTotal = subtotal + fee;
    const code = 'KM' + Date.now().toString(36).toUpperCase().slice(-6);

    const order = await this.prisma.order.create({
      data: {
        tenantId: DEV_TENANT_ID,
        code,
        customerName: dto.customer.name,
        customerPhone: dto.customer.phone,
        addressText: dto.customer.address,
        note: dto.note ?? null,
        status: 'CONFIRMED',
        paymentMethod: dto.paymentMethod ?? 'COD',
        subtotal,
        deliveryFee: fee,
        grandTotal,
        estimatedTotal: grandTotal,
        items: { create: items },
      },
      include: { items: true },
    });
    return order;
  }

  async getOrder(id: string) {
    const order = await this.prisma.order
      .findFirst({ where: { id, tenantId: DEV_TENANT_ID }, include: { items: true } })
      .catch(() => null);
    if (!order) throw new NotFoundException(`Sipariş bulunamadı: ${id}`);
    return order;
  }

  /* -------------------------- Admin sipariş -------------------------- */

  listOrders(status?: string) {
    return this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async updateStatus(id: string, status: string) {
    if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
      throw new BadRequestException(`Geçersiz durum: ${status}`);
    }
    await this.getOrder(id);
    return this.prisma.order.update({ where: { id }, data: { status }, include: { items: true } });
  }
}
