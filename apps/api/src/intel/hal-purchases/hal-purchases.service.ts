import { Injectable, NotFoundException } from '@nestjs/common';
import {
  reconcileHalPurchase,
  weightPrecisionRiskPct,
  type HalReconciliation,
} from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CashService } from '../../cash/cash.service';
import { CreateHalPurchaseDto } from './dto/create-hal-purchase.dto';
import type { HalPurchase as HalPurchaseRow } from '@prisma/client';

/** API yanıtı: ham girdiler + packages/pricing ile hesaplanan mutabakat. */
export interface HalPurchaseResponse {
  id: string;
  productId: string | null;
  recordedKg: number;
  actualKg: number | null;
  totalPaid: number;
  precisionKg: number;
  reconciliation: HalReconciliation;
  weightRiskPct: number;
  createdAt: string;
}

@Injectable()
export class HalPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
  ) {}

  async create(dto: CreateHalPurchaseDto): Promise<HalPurchaseResponse> {
    const row = await this.prisma.halPurchase.create({
      data: {
        tenantId: DEV_TENANT_ID,
        productSlug: dto.productId ?? null,
        recordedKg: dto.recordedKg,
        actualKg: dto.actualKg ?? null,
        totalPaid: dto.totalPaid,
        precisionKg: dto.precisionKg ?? 0.5,
      },
    });
    // Hal alımı → kasadan ÇIKIŞ (kasa açıksa; mükerrer düşmez).
    await this.cash.recordHalPurchase(row.id, row.totalPaid, row.productSlug);
    return this.toResponse(row);
  }

  async findAll(productId?: string): Promise<HalPurchaseResponse[]> {
    const rows = await this.prisma.halPurchase.findMany({
      where: {
        tenantId: DEV_TENANT_ID,
        ...(productId ? { productSlug: productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: string): Promise<HalPurchaseResponse> {
    // .catch(null): geçersiz UUID'de Prisma hata fırlatır → 404'e indir.
    const row = await this.prisma.halPurchase
      .findFirst({ where: { id, tenantId: DEV_TENANT_ID } })
      .catch(() => null);
    if (!row) throw new NotFoundException(`Hal alımı bulunamadı: ${id}`);
    return this.toResponse(row);
  }

  /** Mutabakat ve tartı riski YALNIZCA packages/pricing'ten — okumada hesaplanır. */
  private toResponse(row: HalPurchaseRow): HalPurchaseResponse {
    return {
      id: row.id,
      productId: row.productSlug,
      recordedKg: row.recordedKg,
      actualKg: row.actualKg,
      totalPaid: row.totalPaid,
      precisionKg: row.precisionKg,
      reconciliation: reconcileHalPurchase({
        recordedKg: row.recordedKg,
        actualKg: row.actualKg ?? undefined,
        totalPaid: row.totalPaid,
      }),
      weightRiskPct: weightPrecisionRiskPct(row.recordedKg, row.precisionKg),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
