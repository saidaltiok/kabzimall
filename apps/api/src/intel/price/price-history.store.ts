import { Injectable } from '@nestjs/common';
import { newId } from '../../common/id.util';
import type { Strategy } from '../../pricing-engine';

/**
 * Bir fiyat değişikliği kaydı (Teknik doküman Bölüm 3.3 `price_history`).
 * "Bu fiyat neden böyle?" sorusu her zaman izlenebilsin diye append-only.
 */
export interface PriceHistoryRecord {
  id: string;
  productId: string;
  /** Önceki mağaza fiyatı (kuruş); ilk uygulamada null. */
  oldPrice: number | null;
  /** Yeni mağaza fiyatı (kuruş). */
  newPrice: number;
  strategyApplied: Strategy;
  reason: string | null;
  netMargin: number | null;
  changedBy: string | null;
  changedAt: string;
}

/**
 * Bellek içi fiyat geçmişi (iskelet). Üretimde Intelligence `price_history`
 * tablosu — kayıtların üzerine asla yazılmaz, yalnızca eklenir.
 */
@Injectable()
export class PriceHistoryStore {
  private readonly store: PriceHistoryRecord[] = [];

  append(entry: Omit<PriceHistoryRecord, 'id' | 'changedAt'>): PriceHistoryRecord {
    const record: PriceHistoryRecord = {
      id: newId(),
      changedAt: new Date().toISOString(),
      ...entry,
    };
    this.store.push(record);
    return record;
  }

  /** En yeni → en eski sırada; opsiyonel ürün filtresi. */
  findAll(productId?: string): PriceHistoryRecord[] {
    const all = [...this.store].sort((a, b) => b.changedAt.localeCompare(a.changedAt));
    return productId ? all.filter((r) => r.productId === productId) : all;
  }
}
