import { Injectable, NotFoundException } from '@nestjs/common';
import { directCost, type CostInput } from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CreateCostPoolDto } from './dto/create-cost-pool.dto';
import { Prisma, type CostPool as CostPoolRow } from '@prisma/client';

/** Havuzdan kg başına düşen dağıtımlı maliyet (kuruş). */
export interface PoolAllocation {
  laborPerKg: number;
  fuelPerKg: number;
  coldStoragePerKg: number;
  amortizationPerKg: number;
  distributedPerKg: number;
}

interface PreviewProductInput {
  halAvg: number;
  fireRate: number;
  packaging: number;
  commissionRate: number;
}

export interface CostPoolResponse {
  id: string;
  period: string;
  totalVolumeKg: number;
  totals: { labor: number; fuel: number; coldStorage: number; amortization: number };
  allocation: PoolAllocation;
  preview: { directCost: number; breakdown: CostInput } | null;
  createdAt: string;
}

@Injectable()
export class CostPoolService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCostPoolDto): Promise<CostPoolResponse> {
    const row = await this.prisma.costPool.create({
      data: {
        tenantId: DEV_TENANT_ID,
        period: dto.period,
        totalLabor: dto.totalLabor,
        totalFuel: dto.totalFuel,
        totalColdStorage: dto.totalColdStorage ?? null,
        totalAmortization: dto.totalAmortization ?? null,
        totalVolumeKg: dto.totalVolumeKg,
        previewProduct: dto.previewProduct
          ? (dto.previewProduct as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    return this.toResponse(row);
  }

  async findAll(period?: string): Promise<CostPoolResponse[]> {
    const rows = await this.prisma.costPool.findMany({
      where: {
        tenantId: DEV_TENANT_ID,
        ...(period ? { period } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: string): Promise<CostPoolResponse> {
    // .catch(null): geçersiz UUID'de Prisma hata fırlatır → 404'e indir.
    const row = await this.prisma.costPool
      .findFirst({ where: { id, tenantId: DEV_TENANT_ID } })
      .catch(() => null);
    if (!row) throw new NotFoundException(`Maliyet havuzu bulunamadı: ${id}`);
    return this.toResponse(row);
  }

  /**
   * Tahsis (kg başına) ve directCost önizlemesi YALNIZCA packages/pricing'ten —
   * okumada hesaplanır; veritabanında yalnızca ham girdiler tutulur.
   */
  private toResponse(row: CostPoolRow): CostPoolResponse {
    const vol = row.totalVolumeKg;
    const coldStorage = row.totalColdStorage ?? 0;
    const amortization = row.totalAmortization ?? 0;

    const laborPerKg = Math.round(row.totalLabor / vol);
    const fuelPerKg = Math.round(row.totalFuel / vol);
    const coldStoragePerKg = Math.round(coldStorage / vol);
    const amortizationPerKg = Math.round(amortization / vol);

    const allocation: PoolAllocation = {
      laborPerKg,
      fuelPerKg,
      coldStoragePerKg,
      amortizationPerKg,
      distributedPerKg: laborPerKg + fuelPerKg + coldStoragePerKg + amortizationPerKg,
    };

    let preview: CostPoolResponse['preview'] = null;
    const pp = row.previewProduct as unknown as PreviewProductInput | null;
    if (pp) {
      const breakdown: CostInput = {
        halAvg: pp.halAvg,
        fireRate: pp.fireRate,
        labor: laborPerKg,
        packaging: pp.packaging,
        fuel: fuelPerKg,
        coldStorage: coldStoragePerKg,
        amortization: amortizationPerKg,
        commissionRate: pp.commissionRate,
      };
      preview = { directCost: Math.round(directCost(breakdown)), breakdown };
    }

    return {
      id: row.id,
      period: row.period,
      totalVolumeKg: vol,
      totals: { labor: row.totalLabor, fuel: row.totalFuel, coldStorage, amortization },
      allocation,
      preview,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
