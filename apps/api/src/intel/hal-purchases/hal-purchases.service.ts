import { Injectable, NotFoundException } from '@nestjs/common';
import {
  reconcileHalPurchase,
  weightPrecisionRiskPct,
  type HalPurchase,
  type HalReconciliation,
} from '../../pricing-engine';
import { newId } from '../../common/id.util';
import { CreateHalPurchaseDto } from './dto/create-hal-purchase.dto';

export interface HalPurchaseRecord {
  id: string;
  productId: string | null;
  recordedKg: number;
  actualKg: number | null;
  totalPaid: number;
  precisionKg: number;
  /** packages/pricing çıktısı: efektif birim maliyet + kazanç/kayıp. */
  reconciliation: HalReconciliation;
  /** ±precisionKg'nin birim maliyete azami etkisi (0..1). */
  weightRiskPct: number;
  createdAt: string;
}

@Injectable()
export class HalPurchasesService {
  // In-memory store (iskelet). Üretimde: hal_price_entries / alım tablosu.
  private readonly store = new Map<string, HalPurchaseRecord>();

  create(dto: CreateHalPurchaseDto): HalPurchaseRecord {
    const purchase: HalPurchase = {
      recordedKg: dto.recordedKg,
      actualKg: dto.actualKg,
      totalPaid: dto.totalPaid,
    };
    const precisionKg = dto.precisionKg ?? 0.5;

    const record: HalPurchaseRecord = {
      id: newId(),
      productId: dto.productId ?? null,
      recordedKg: dto.recordedKg,
      actualKg: dto.actualKg ?? null,
      totalPaid: dto.totalPaid,
      precisionKg,
      reconciliation: reconcileHalPurchase(purchase),
      weightRiskPct: weightPrecisionRiskPct(dto.recordedKg, precisionKg),
      createdAt: new Date().toISOString(),
    };

    this.store.set(record.id, record);
    return record;
  }

  findAll(productId?: string): HalPurchaseRecord[] {
    const all = [...this.store.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return productId ? all.filter((r) => r.productId === productId) : all;
  }

  findOne(id: string): HalPurchaseRecord {
    const rec = this.store.get(id);
    if (!rec) throw new NotFoundException(`Hal alımı bulunamadı: ${id}`);
    return rec;
  }
}
