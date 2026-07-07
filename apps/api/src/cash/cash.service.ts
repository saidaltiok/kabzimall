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

  /**
   * Açık oturum + hareketler + anlık bakiye. Oturum yoksa session:null döner;
   * kasa kapalıyken biriken ASKIDA hareketler (pending) yine listelenir ki
   * para izi görünür kalsın (açılışta otomatik oturuma bağlanırlar).
   */
  async current() {
    const session = await this.openSession();
    if (!session) {
      const pending = await this.prisma.cashMovement.findMany({
        where: { tenantId: DEV_TENANT_ID, sessionId: null },
        orderBy: { createdAt: 'desc' },
      });
      return { session: null, pending };
    }
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
    const session = await this.prisma.registerSession.create({
      data: { tenantId: DEV_TENANT_ID, openingFloat, openedBy: actor ?? null, note: note?.trim() || null },
    });
    // Askıda hareketler (kasa kapalıyken düşen otomatik tahsilat/alım) bu oturuma bağlanır —
    // para izi kaybolmaz, açılışla birlikte bakiyeye girer.
    const claimed = await this.prisma.cashMovement.updateMany({
      where: { tenantId: DEV_TENANT_ID, sessionId: null },
      data: { sessionId: session.id },
    });
    if (claimed.count > 0) this.logger.log(`Kasa açılışı: ${claimed.count} askıda hareket oturuma bağlandı.`);
    return { ...session, claimedPending: claimed.count };
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

  /**
   * Otomatik hareket yaz — kasa açıksa oturuma, KAPALIYSA askıya (sessionId null).
   * Para izi asla kaybolmaz; askıdakiler bir sonraki açılışta oturuma bağlanır.
   * Mükerrer koruması TENANT genelinde (oturumlar arası tekrar yazılmaz).
   */
  private async recordAuto(type: 'IN' | 'OUT', category: string, amount: number, refCode: string, note: string) {
    try {
      if (amount <= 0) return;
      const dup = await this.prisma.cashMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, category, refCode } });
      if (dup) return;
      const session = await this.openSession();
      await this.prisma.cashMovement.create({
        data: { tenantId: DEV_TENANT_ID, sessionId: session?.id ?? null, type, category, amount, refCode, note: session ? note : `${note} — kasa kapalıyken (askıda)` },
      });
    } catch (e) {
      this.logger.warn(`Kasa otomatik kaydı düşülemedi (${refCode}): ${(e as Error).message}`);
    }
  }

  /** Teslim edilen kapıda-ödeme siparişi → GİRİŞ (sipariş başına bir kez). */
  recordSale(orderCode: string, amount: number) {
    return this.recordAuto('IN', 'SALE', amount, orderCode, 'Teslimat tahsilatı (otomatik)');
  }

  /** Teslim edilmiş sipariş sonradan iptal edilirse → tahsilatı geri çıkar (ÇIKIŞ). */
  recordSaleReversal(orderCode: string, amount: number) {
    return this.recordAuto('OUT', 'SALE_REVERSAL', amount, orderCode, 'Teslim sonrası iptal — tahsilat iadesi (otomatik)');
  }

  /** Hal alımı → ÇIKIŞ. */
  recordHalPurchase(purchaseId: string, totalPaid: number, slug?: string | null) {
    return this.recordAuto('OUT', 'HAL_PURCHASE', totalPaid, `HAL:${purchaseId}`, `Hal alımı${slug ? ` (${slug})` : ''} (otomatik)`);
  }
}
