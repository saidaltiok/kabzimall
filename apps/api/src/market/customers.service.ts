import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';

/**
 * Müşteri kartı: ayrı müşteri tablosu YOK (guest-first) — kart, sipariş
 * geçmişinden telefonla gruplanarak türetilir. Ciro: kesinleşen tutar
 * (finalTotal) varsa o; iptaller ciroya girmez ama sayısı gösterilir.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, channel: { not: 'POS' } }, // tezgâh fişinde müşteri yok
      select: {
        customerName: true, customerPhone: true, customerEmail: true,
        status: true, grandTotal: true, finalTotal: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    interface Card {
      phone: string; name: string; email: string | null;
      orders: number; cancelled: number; totalSpent: number;
      firstOrderAt: Date; lastOrderAt: Date;
    }
    const byPhone = new Map<string, Card>();
    for (const o of orders) {
      const e = byPhone.get(o.customerPhone) ?? {
        phone: o.customerPhone,
        name: o.customerName, // en yeni sipariş adı (liste desc geldiği için ilk görülen)
        email: o.customerEmail,
        orders: 0, cancelled: 0, totalSpent: 0,
        firstOrderAt: o.createdAt, lastOrderAt: o.createdAt,
      };
      e.orders += 1;
      if (o.status === 'CANCELLED') e.cancelled += 1;
      else e.totalSpent += o.finalTotal ?? o.grandTotal;
      if (o.createdAt < e.firstOrderAt) e.firstOrderAt = o.createdAt;
      if (o.createdAt > e.lastOrderAt) e.lastOrderAt = o.createdAt;
      if (!e.email && o.customerEmail) e.email = o.customerEmail;
      byPhone.set(o.customerPhone, e);
    }

    let cards = [...byPhone.values()].sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime());
    if (search?.trim()) {
      const q = search.trim().toLocaleLowerCase('tr');
      cards = cards.filter((c) => c.name.toLocaleLowerCase('tr').includes(q) || c.phone.includes(q) || (c.email ?? '').includes(q));
    }
    return cards;
  }

  /** Tek müşterinin sipariş geçmişi (telefonla). */
  ordersOf(phone: string) {
    return this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, customerPhone: phone },
      select: {
        id: true, code: true, status: true, subtotal: true, discountTotal: true, couponCode: true,
        deliveryFee: true, grandTotal: true, finalTotal: true, createdAt: true,
        items: { select: { productName: true, orderedQty: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
