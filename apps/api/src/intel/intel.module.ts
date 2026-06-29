import { Module } from '@nestjs/common';
import { PriceController } from './price/price.controller';
import { PriceService } from './price/price.service';
import { HalPurchasesController } from './hal-purchases/hal-purchases.controller';
import { HalPurchasesService } from './hal-purchases/hal-purchases.service';
import { CostPoolController } from './cost-pool/cost-pool.controller';
import { CostPoolService } from './cost-pool/cost-pool.service';

/**
 * Intelligence (fiyat zekâsı) modülü — Teknik doküman Bölüm 5.5.
 * Bu ilk kesimde 3 çekirdek uç var (Devam Rehberi Bölüm 8):
 *   POST /intel/price/resolve   — hiyerarşik fiyat çözümü (resolvePrice)
 *        /intel/hal-purchases   — hal alımı + ±500 g tartı mutabakatı
 *        /intel/cost-pool       — havuz/dağıtımlı maliyet → birim (kg) tahsis
 */
@Module({
  controllers: [PriceController, HalPurchasesController, CostPoolController],
  providers: [PriceService, HalPurchasesService, CostPoolService],
})
export class IntelModule {}
