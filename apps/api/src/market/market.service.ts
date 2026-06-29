import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { deliveryFee, lineTotal, effectivePrice } from '../pricing-engine';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { dateOnly } from '../common/date';
import { CreateOrderDto, DELIVERY_WINDOWS } from './dto/create-order.dto';

const DAY_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** Müşteriye açık ürün alanları (maliyet/marj ASLA sızmaz). */
const PUBLIC_PRODUCT_SELECT = {
  slug: true,
  name: true,
  saleType: true,
  unitLabel: true,
  imageUrl: true,
  stockQty: true,
  basePrice: true,
  discountedPrice: true,
  isActive: true,
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
        kind: 'SIMPLE', // hazır sepetler ayrı bölümde
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

  /* --------------------------- Teslimat bölgesi -------------------------- */

  listActiveZones() {
    return this.prisma.deliveryZone.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true }, orderBy: { name: 'asc' }, select: { name: true } });
  }

  adminListZones() {
    return this.prisma.deliveryZone.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: { name: 'asc' } });
  }

  async createZone(name: string) {
    try {
      return await this.prisma.deliveryZone.create({ data: { tenantId: DEV_TENANT_ID, name: name.trim() } });
    } catch {
      throw new BadRequestException('Bu ilçe zaten ekli');
    }
  }

  async removeZone(id: string) {
    const z = await this.prisma.deliveryZone.findFirst({ where: { id, tenantId: DEV_TENANT_ID } }).catch(() => null);
    if (!z) throw new NotFoundException(`Bölge bulunamadı: ${id}`);
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true };
  }

  /** Yayındaki hazır sepetler — her biri kendi fiyatlı AYRI ürün + içeriği. */
  async listBaskets() {
    const rows = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, kind: 'BASKET', isActive: true, basePrice: { not: null } },
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
      select: {
        slug: true, name: true, unitLabel: true, imageUrl: true, basePrice: true, discountedPrice: true, stockQty: true,
        components: { include: { component: { select: { slug: true, name: true, unitLabel: true } } } },
      },
    });
    return rows.map((b) => ({
      slug: b.slug,
      name: b.name,
      imageUrl: b.imageUrl,
      unitLabel: b.unitLabel,
      basePrice: b.basePrice,
      discountedPrice: b.discountedPrice,
      price: effectivePrice(b.basePrice as number, b.discountedPrice),
      stockQty: b.stockQty,
      components: b.components.map((c) => ({ slug: c.component.slug, name: c.component.name, unitLabel: c.component.unitLabel, qty: c.qty })),
    }));
  }

  /* --------------------------- Teslimat slotu --------------------------- */

  /** Ertesi gün(ler) için teslimat slotları (Faz 1: SCHEDULED, sonraki 2 gün). */
  availableSlots(): { date: string; window: string; label: string }[] {
    const out: { date: string; window: string; label: string }[] = [];
    for (let off = 1; off <= 2; off++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + off);
      const date = d.toISOString().slice(0, 10);
      const dayLabel =
        off === 1
          ? 'Yarın'
          : `${DAY_TR[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      for (const w of DELIVERY_WINDOWS) out.push({ date, window: w, label: `${dayLabel} ${w}` });
    }
    return out;
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
      if (p.stockQty != null && i.qty > p.stockQty) {
        throw new BadRequestException(`Yeterli stok yok: ${p.name} (kalan ${p.stockQty} ${p.unitLabel ?? ''})`);
      }
      const unitPrice = effectivePrice(p.basePrice, p.discountedPrice);
      return {
        productId: p.id,
        productName: p.name,
        unitLabel: p.unitLabel,
        unitPrice,
        orderedQty: i.qty,
        lineTotal: lineTotal(unitPrice, i.qty),
      };
    });

    // Bölge doğrulama: hizmet ilçesi tanımlıysa, sipariş ilçesi listede olmalı.
    const zones = await this.prisma.deliveryZone.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true }, select: { name: true } });
    if (zones.length > 0) {
      const d = dto.customer.district?.trim();
      if (!d) throw new BadRequestException('Teslimat ilçesi gerekli');
      if (!zones.some((z) => z.name.toLowerCase() === d.toLowerCase())) {
        throw new BadRequestException(`Bu ilçeye teslimat yapılmıyor: ${d}`);
      }
    }

    // Slot doğrulama: yalnızca sunulan günlerden/pencerelerden biri kabul edilir.
    let deliveryDate: Date | null = null;
    let deliveryWindow: string | null = null;
    if (dto.slot) {
      const valid = this.availableSlots().some((s) => s.date === dto.slot!.date && s.window === dto.slot!.window);
      if (!valid) throw new BadRequestException('Geçersiz teslimat slotu');
      deliveryDate = dateOnly(dto.slot.date);
      deliveryWindow = dto.slot.window;
    }

    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const fee = deliveryFee(subtotal);
    const grandTotal = subtotal + fee;
    const code = 'KM' + Date.now().toString(36).toUpperCase().slice(-6);

    // Sipariş oluşturma + stok düşme atomik (takip edilen ürünlerde).
    return this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        const p = products.find((x) => x.id === it.productId)!;
        if (p.stockQty != null) {
          await tx.product.update({ where: { id: p.id }, data: { stockQty: { decrement: it.orderedQty } } });
        }
      }
      return tx.order.create({
        data: {
          tenantId: DEV_TENANT_ID,
          code,
          customerName: dto.customer.name,
          customerPhone: dto.customer.phone,
          addressText: dto.customer.address,
          district: dto.customer.district ?? null,
          note: dto.note ?? null,
          status: 'CONFIRMED',
          paymentMethod: dto.paymentMethod ?? 'COD',
          deliveryDate,
          deliveryWindow,
          subtotal,
          deliveryFee: fee,
          grandTotal,
          estimatedTotal: grandTotal,
          items: { create: items },
        },
        include: { items: true },
      });
    });
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

  /**
   * Paketleme: tartılan gerçek gramajları işler; satır ve toplam kesinleşir
   * (estimated → final). lineTotal packages/pricing'ten. Sipariş 'READY' olur.
   */
  async packOrder(id: string, items: { itemId: string; pickedQty: number }[]) {
    const order = await this.getOrder(id);
    const picked = new Map(items.map((i) => [i.itemId, i.pickedQty]));
    for (const pi of items) {
      if (!order.items.some((it) => it.id === pi.itemId)) {
        throw new BadRequestException(`Kalem bu siparişe ait değil: ${pi.itemId}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let finalSubtotal = 0;
      for (const it of order.items) {
        const qty = picked.get(it.id) ?? it.pickedQty ?? it.orderedQty;
        const lt = lineTotal(it.unitPrice, qty);
        finalSubtotal += lt;
        if (picked.has(it.id)) {
          await tx.orderItem.update({ where: { id: it.id }, data: { pickedQty: picked.get(it.id)!, lineTotal: lt } });
        }
      }
      return tx.order.update({
        where: { id },
        data: { finalTotal: finalSubtotal + order.deliveryFee, status: 'READY' },
        include: { items: true },
      });
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
