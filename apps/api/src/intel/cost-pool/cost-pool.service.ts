import { Injectable, NotFoundException } from '@nestjs/common';
import { directCost, type CostInput } from '../../pricing-engine';
import { newId } from '../../common/id.util';
import { CreateCostPoolDto } from './dto/create-cost-pool.dto';

/** Havuzdan kg başına düşen dağıtımlı maliyet (kuruş). */
export interface PoolAllocation {
  laborPerKg: number;
  fuelPerKg: number;
  coldStoragePerKg: number;
  amortizationPerKg: number;
  /** Dağıtımlı kalemlerin kg başına toplamı. */
  distributedPerKg: number;
}

export interface CostPoolRecord {
  id: string;
  period: string;
  totalVolumeKg: number;
  totals: {
    labor: number;
    fuel: number;
    coldStorage: number;
    amortization: number;
  };
  allocation: PoolAllocation;
  /** previewProduct verildiyse: packages/pricing directCost önizlemesi. */
  preview: {
    directCost: number;
    breakdown: CostInput;
  } | null;
  createdAt: string;
}

@Injectable()
export class CostPoolService {
  // In-memory store (iskelet). Üretimde: cost_components havuz kayıtları.
  private readonly store = new Map<string, CostPoolRecord>();

  create(dto: CreateCostPoolDto): CostPoolRecord {
    const vol = dto.totalVolumeKg;
    const coldStorage = dto.totalColdStorage ?? 0;
    const amortization = dto.totalAmortization ?? 0;

    const laborPerKg = Math.round(dto.totalLabor / vol);
    const fuelPerKg = Math.round(dto.totalFuel / vol);
    const coldStoragePerKg = Math.round(coldStorage / vol);
    const amortizationPerKg = Math.round(amortization / vol);

    const allocation: PoolAllocation = {
      laborPerKg,
      fuelPerKg,
      coldStoragePerKg,
      amortizationPerKg,
      distributedPerKg:
        laborPerKg + fuelPerKg + coldStoragePerKg + amortizationPerKg,
    };

    let preview: CostPoolRecord['preview'] = null;
    if (dto.previewProduct) {
      // Havuz tahsisi + ürün-bazlı kalemler → tam CostInput → directCost.
      // Fiyat/maliyet mantığı YALNIZCA packages/pricing'ten gelir.
      const breakdown: CostInput = {
        halAvg: dto.previewProduct.halAvg,
        fireRate: dto.previewProduct.fireRate,
        labor: laborPerKg,
        packaging: dto.previewProduct.packaging,
        fuel: fuelPerKg,
        coldStorage: coldStoragePerKg,
        amortization: amortizationPerKg,
        commissionRate: dto.previewProduct.commissionRate,
      };
      preview = { directCost: Math.round(directCost(breakdown)), breakdown };
    }

    const record: CostPoolRecord = {
      id: newId(),
      period: dto.period,
      totalVolumeKg: vol,
      totals: { labor: dto.totalLabor, fuel: dto.totalFuel, coldStorage, amortization },
      allocation,
      preview,
      createdAt: new Date().toISOString(),
    };

    this.store.set(record.id, record);
    return record;
  }

  findAll(period?: string): CostPoolRecord[] {
    const all = [...this.store.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return period ? all.filter((r) => r.period === period) : all;
  }

  findOne(id: string): CostPoolRecord {
    const rec = this.store.get(id);
    if (!rec) throw new NotFoundException(`Maliyet havuzu bulunamadı: ${id}`);
    return rec;
  }
}
