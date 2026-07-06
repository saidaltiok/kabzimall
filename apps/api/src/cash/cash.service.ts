import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';

export interface MovementInput {
  type: 'IN' | 'OUT';
  category?: string;
  amount: number; // kuruş, pozitif
  note?: string;
  refCode?: string;
}

const CATEGORIES = ['SALE', 'SALE_REVERSAL', 'HAL_PURCHASE', 'EXPENSE', 'DEPOSIT', 'WITHDRAWAL', 'OTHER'];

/**
 * Kasa (till): açılış bakiyesiyle oturum açılır; teslim edilen kapıda-ödeme
 * siparişleri otomatik GİRİŞ, hal alımları otomatik ÇIKIŞ düşer (kasa açıksa).
 * Kapanışta sayılan tutar beklenenle karşılaştırılır (fark = sayım − beklenen).
 */
@Injectable()
export class CashService {
  private readonly logger = new Logger('Cash');

  constructor(private readonly prisma: PrismaService) {}

  private openSession() {
    return this.prisma.registerSession.findFirst({
      where: { tenantId: DEV_TENANT_ID, closedAt: null },
      orderBy: { openedAt: 'desc' },
    });
  }

  /** Beklenen kasa: açılış + girişler − çıkışlar. */
  private async expectedFor(sessionId: string, openingFloat: number) {
    const sums = await this.prisma.cashMovement.groupBy({
      by: ['type'],
      where: { tenantId: DEV_TENANT_ID, sessionId },
      _sum: { amount: true },
    });
    const inSum = sums.find((s) => s.type === 'IN')?._sum.amount ?? 0;
    const outSum = sums.find((s) => s.type === 'OUT')?._sum.amount ?? 0;
    return { inSum, outSum, expected: openingFloat + inSum - outSum };
  }

  /** Açık oturum + hareketler + anlık bakiye (yoksa session:null). */
  async current() {
    const session = await this.openSession();
    if (!session) return { session: null };
    const movements = await this.prisma.cashMovement.findMany({
      where: { tenantId: DEV_TENANT_ID, sessionId: session.id },
      orderBy: { createdAt: 'desc' },
    });
    const { inSum, outSum, expected } = await this.expectedFor(session.id, session.openingFloat);
    return { session, movements, totals: { inSum, outSum, balance: expected } };
  }

  async open(openingFloat: number, actor?: string, note?: string) {
    if (!Number.isInteger(openingFloat) || openingFloat < 0) throw new BadRequestException('Açılış bakiyesi (kuruş) 0 ya da pozitif tam sayı olmalı.');
    const existing = await this.openSession();
    if (existing) throw new BadRequestException('Zaten açık bir kasa oturumu var — önce kapatın.');
    return this.prisma.registerSession.create({
      data: { tenantId: DEV_TENANT_ID, openingFloat, openedBy: actor ?? null, note: note?.trim() || null },
    });
  }

  async addMovement(dto: MovementInput, actor?: string) {
    const session = await this.openSession();
    if (!session) throw new BadRequestException('Açık kasa oturumu yok — önce kasayı açın.');
    if (!['IN', 'OUT'].includes(dto.type)) throw new BadRequestException('type IN ya da OUT olmalı.');
    if (dto.category && !CATEGORIES.includes(dto.category)) throw new BadRequestException(`Kategori: ${CATEGORIES.join(', ')}`);
    if (!Number.isInteger(dto.amount) || dto.amount <= 0) throw new BadRequestException('Tutar (kuruş) pozitif tam sayı olmalı.');
    return this.prisma.cashMovement.create({
      data: {
        tenantId: DEV_TENANT_ID, sessionId: session.id,
        type: dto.type, category: dto.category ?? 'OTHER', amount: dto.amount,
        note: dto.note?.trim() || null, refCode: dto.refCode?.trim() || null, createdBy: actor ?? null,
      },
    });
  }

  /** Kapanış: sayılan tutar → beklenenle fark hesaplanır, oturum kilitlenir. */
  async close(counted: number, actor?: string, note?: string) {
    if (!Number.isInteger(counted) || counted < 0) throw new BadRequestException('Sayılan tutar (kuruş) 0 ya da pozitif olmalı.');
    const session = await this.openSession();
    if (!session) throw new BadRequestException('Açık kasa oturumu yok.');
    const { expected } = await this.expectedFor(session.id, session.openingFloat);
    return this.prisma.registerSession.update({
      where: { id: session.id },
      data: {
        closedAt: new Date(), closedBy: actor ?? null,
        countedClose: counted, expectedClose: expected,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    });
  }

  /** Oturum geçmişi (en yeni önce) + oturum başına özet. */
  async sessions(limit = 30) {
    const rows = await this.prisma.registerSession.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: { openedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      include: { movements: { select: { type: true, amount: true } } },
    });
    return rows.map((s) => {
      const inSum = s.movements.filter((m) => m.type === 'IN').reduce((a, m) => a + m.amount, 0);
      const outSum = s.movements.filter((m) => m.type === 'OUT').reduce((a, m) => a + m.amount, 0);
      const { movements, ...rest } = s;
      return {
        ...rest, inSum, outSum, movementCount: movements.length,
        expected: s.expectedClose ?? s.openingFloat + inSum - outSum,
        variance: s.countedClose != null && s.expectedClose != null ? s.countedClose - s.expectedClose : null,
      };
    });
  }

  /* --------------------- Otomatik beslemeler (hook'lar) --------------------- */

  /** Teslim edilen kapıda-ödeme siparişi → GİRİŞ (kasa açıksa; sipariş başına bir kez). */
  async recordSale(orderCode: string, amount: number) {
    try {
      const session = await this.openSession();
      if (!session || amount <= 0) return;
      // Mükerrer koruması TENANT genelinde: oturum kapanıp açılsa bile aynı
      // sipariş ikinci kez GİRİŞ yazılmaz (DELIVERED→...→DELIVERED tekrarı).
      const dup = await this.prisma.cashMovement.findFirst({
        where: { tenantId: DEV_TENANT_ID, category: 'SALE', refCode: orderCode },
      });
      if (dup) return;
      await this.prisma.cashMovement.create({
        data: { tenantId: DEV_TENANT_ID, sessionId: session.id, type: 'IN', category: 'SALE', amount, refCode: orderCode, note: 'Teslimat tahsilatı (otomatik)' },
      });
    } catch (e) {
      this.logger.warn(`Kasa satış kaydı düşülemedi (${orderCode}): ${(e as Error).message}`);
    }
  }

  /** Teslim edilmiş sipariş sonradan iptal edilirse → tahsilatı geri çıkar (ÇIKIŞ). */
  async recordSaleReversal(orderCode: string, amount: number) {
    try {
      const session = await this.openSession();
      if (!session || amount <= 0) return;
      const dup = await this.prisma.cashMovement.findFirst({
        where: { tenantId: DEV_TENANT_ID, category: 'SALE_REVERSAL', refCode: orderCode },
      });
      if (dup) return;
      await this.prisma.cashMovement.create({
        data: { tenantId: DEV_TENANT_ID, sessionId: session.id, type: 'OUT', category: 'SALE_REVERSAL', amount, refCode: orderCode, note: 'Teslim sonrası iptal — tahsilat iadesi (otomatik)' },
      });
    } catch (e) {
      this.logger.warn(`Kasa iade kaydı düşülemedi (${orderCode}): ${(e as Error).message}`);
    }
  }

  /** Hal alımı → ÇIKIŞ (kasa açıksa; mükerrer düşmez). */
  async recordHalPurchase(purchaseId: string, totalPaid: number, slug?: string | null) {
    try {
      const session = await this.openSession();
      if (!session || totalPaid <= 0) return;
      const ref = `HAL:${purchaseId}`;
      const dup = await this.prisma.cashMovement.findFirst({
        where: { tenantId: DEV_TENANT_ID, sessionId: session.id, category: 'HAL_PURCHASE', refCode: ref },
      });
      if (dup) return;
      await this.prisma.cashMovement.create({
        data: { tenantId: DEV_TENANT_ID, sessionId: session.id, type: 'OUT', category: 'HAL_PURCHASE', amount: totalPaid, refCode: ref, note: `Hal alımı${slug ? ` (${slug})` : ''} (otomatik)` },
      });
    } catch (e) {
      this.logger.warn(`Kasa hal alımı kaydı düşülemedi (${purchaseId}): ${(e as Error).message}`);
    }
  }
}
