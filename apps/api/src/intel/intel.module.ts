import { Module } from '@nestjs/common';
import { PriceController } from './price/price.controller';
import { PriceService } from './price/price.service';
import { HalPurchasesController } from './hal-purchases/hal-purchases.controller';
import { HalPurchasesService } from './hal-purchases/hal-purchases.service';
import { CostPoolController } from './cost-pool/cost-pool.controller';
import { CostPoolService } from './cost-pool/cost-pool.service';
import { HalController } from './hal/hal.controller';
import { HalService } from './hal/hal.service';

/**
 * Intelligence (fiyat zekâsı) modülü — Teknik doküman Bölüm 5.5.
 * Kalıcılık PrismaService üzerinden (global PrismaModule).
 * Uçlar:
 *   POST /intel/price/resolve   — hiyerarşik fiyat çözümü (resolvePrice)
 *   POST /intel/price/suggest   — tek strateji ile öneri (suggestPrice)
 *   POST /intel/price/apply     — base_price yayınla + price_history (Bölüm 6.3)
 *   GET  /intel/price/history   — uygulanan fiyat geçmişi
 *   POST /intel/hal/entries     — günlük hal fiyatı (append-only)
 *   POST /intel/hal/bulk        — Saha Modu toplu hal kaydı
 *   GET  /intel/hal             — ürün × gün ızgarası + günlük ortalama
 *        /intel/hal-purchases   — hal alımı + ±500 g tartı mutabakatı
 *        /intel/cost-pool       — havuz/dağıtımlı maliyet → birim (kg) tahsis
 */
@Module({
  controllers: [
    PriceController,
    HalController,
    HalPurchasesController,
    CostPoolController,
  ],
  providers: [PriceService, HalService, HalPurchasesService, CostPoolService],
})
export class IntelModule {}
