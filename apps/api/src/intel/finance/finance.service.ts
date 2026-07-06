import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CostComponentsService } from '../cost-components/cost-components.service';

export interface OverheadInput {
  name: string; category?: string; kind?: 'FIXED' | 'RATE';
  amount?: number; rate?: number; period?: 'MONTHLY' | 'ONE_TIME'; incurredAt?: string; isActive?: boolean;
}

const CATEGORIES = ['RENT', 'PACKAGING', 'LABOR', 'FUEL', 'COMMISSION', 'OTHER'];

/**
 * Finans: üründen bağımsız genel giderler + tarih aralığı kâr/zarar.
 * Genel giderler birim maliyete GİRMEZ; yalnız K/Z'ye yansır (ürüne bağlı
 * girdiler birim maliyette, cost-components'te). Kart komisyonu = RATE gider.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
  ) {}

  /* ----------------------------- Genel giderler ----------------------------- */

  listOverheads() {
    return this.prisma.overheadCost.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  private validate(dto: OverheadInput) {
    if (!dto.name?.trim()) throw new BadRequestException('Gider adı zorunlu.');
    const kind = dto.kind ?? 'FIXED';
    if (!['FIXED', 'RATE'].includes(kind)) throw new BadRequestException('kind FIXED ya da RATE olmalı.');
    if (dto.category && !CATEGORIES.includes(dto.category)) throw new BadRequestException(`Kategori: ${CATEGORIES.join(', ')}`);
    if (kind === 'FIXED' && (dto.amount == null || dto.amount <= 0)) throw new BadRequestException('Sabit giderde tutar (kuruş) pozitif olmalı.');
    if (kind === 'RATE' && (dto.rate == null || dto.rate <= 0 || dto.rate >= 1)) throw new BadRequestException('Oranlı giderde oran 0-1 arası olmalı (ör. 0.03).');
  }

  async createOverhead(dto: OverheadInput) {
    this.validate(dto);
    const kind = dto.kind ?? 'FIXED';
    return this.prisma.overheadCost.create({
      data: {
        tenantId: DEV_TENANT_ID, name: dto.name.trim(), category: dto.category ?? 'OTHER', kind,
        amount: kind === 'FIXED' ? Math.round(dto.amount!) : 0,
        rate: kind === 'RATE' ? dto.rate! : 0,
        period: dto.period ?? 'MONTHLY',
        incurredAt: dto.period === 'ONE_TIME' && dto.incurredAt ? new Date(dto.incurredAt) : null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateOverhead(id: string, dto: Partial<OverheadInput>) {
    const cur = await this.prisma.overheadCost.findFirst({ where: { id, tenantId: DEV_TENANT_ID } });
    if (!cur) throw new NotFoundException('Gider bulunamadı.');
    const merged = { ...cur, ...dto } as OverheadInput;
    if (dto.name !== undefined || dto.kind !== undefined || dto.amount !== undefined || dto.rate !== undefined || dto.category !== undefined) this.validate(merged);
    const kind = (dto.kind ?? cur.kind) as 'FIXED' | 'RATE';
    return this.prisma.overheadCost.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.kind !== undefined ? { kind } : {}),
        ...(dto.amount !== undefined ? { amount: kind === 'FIXED' ? Math.round(dto.amount) : 0 } : {}),
        ...(dto.rate !== undefined ? { rate: kind === 'RATE' ? dto.rate : 0 } : {}),
        ...(dto.period !== undefined ? { period: dto.period } : {}),
        ...(dto.incurredAt !== undefined ? { incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeOverhead(id: string) {
    const r = await this.prisma.overheadCost.deleteMany({ where: { id, tenantId: DEV_TENANT_ID } });
    if (r.count === 0) throw new NotFoundException('Gider bulunamadı.');
    return { deleted: true };
  }

  /* ------------------------------- Kâr / Zarar ------------------------------ */

  /**
   * Seçilen tarih aralığında gerçekleşen kâr/zarar.
   * Ciro = teslim edilen siparişlerin kesinleşen tutarı. COGS = birim maliyet ×
   * satılan miktar. Net = ciro − COGS − genel giderler (sabit prorata + oranlı×ciro).
   */
  async profitLoss(fromStr: string, toStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      throw new BadRequestException('from ve to YYYY-MM-DD olmalı.');
    }
    const from = new Date(`${fromStr}T00:00:00.000Z`);
    const to = new Date(`${toStr}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestException('Geçersiz tarih.');
    if (to < from) throw new BadRequestException('to, from’dan önce olamaz.');
    const end = new Date(to.getTime() + 86_400_000); // to günü dahil
    const days = Math.round((end.getTime() - from.getTime()) / 86_400_000);

    const orders = await this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, status: 'DELIVERED', createdAt: { gte: from, lt: end } },
      select: { grandTotal: true, finalTotal: true, items: { select: { orderedQty: true, pickedQty: true, unitCostSnapshot: true, product: { select: { slug: true } } } } },
    });

    const revenue = orders.reduce((s, o) => s + (o.finalTotal ?? o.grandTotal), 0);
    const orderCount = orders.length;

    // COGS: TARİHSEL maliyet — satış anındaki birim maliyet (unitCostSnapshot).
    // Snapshot yoksa (eski kayıt) bugünkü maliyete düşülür; tanımsızsa uyarılır.
    let cogs = 0;
    const missingSlugs = new Set<string>();
    const todayCost = new Map<string, number | null>();
    for (const o of orders) for (const it of o.items) {
      const slug = it.product?.slug; if (!slug) continue;
      const qty = it.pickedQty ?? it.orderedQty;
      let unit = it.unitCostSnapshot;
      if (unit == null) {
        if (!todayCost.has(slug)) todayCost.set(slug, (await this.costs.costForProduct(slug).catch(() => null))?.directCost ?? null);
        unit = todayCost.get(slug) ?? null;
      }
      if (unit == null) { missingSlugs.add(slug); continue; }
      cogs += Math.round(unit * qty);
    }
    const missingCost = [...missingSlugs];

    // Genel giderler
    const overheads = await this.prisma.overheadCost.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true } });
    const breakdown: { name: string; category: string; kind: string; amountInRange: number }[] = [];
    let overheadTotal = 0;
    for (const oh of overheads) {
      let amt = 0;
      if (oh.kind === 'RATE') amt = Math.round(oh.rate * revenue);
      else if (oh.period === 'ONE_TIME') amt = oh.incurredAt && oh.incurredAt >= from && oh.incurredAt < end ? oh.amount : 0;
      else amt = Math.round(oh.amount * (days / 30)); // MONTHLY → günlük prorata
      if (amt !== 0) { breakdown.push({ name: oh.name, category: oh.category, kind: oh.kind, amountInRange: amt }); overheadTotal += amt; }
    }

    const grossProfit = revenue - cogs;
    return {
      from: fromStr, to: toStr, days, orderCount,
      revenue, cogs, grossProfit,
      overheadTotal, overheadBreakdown: breakdown,
      net: grossProfit - overheadTotal,
      missingCost, // maliyeti tanımsız (COGS'a girmeyen) ürünler
    };
  }
}
