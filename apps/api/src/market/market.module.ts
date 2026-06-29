import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { StorefrontController, AdminOrdersController } from './market.controller';

/**
 * Market — müşteri tarafı (Faz 1). Public vitrin + misafir sipariş (kapıda ödeme)
 * + admin sipariş yönetimi. Fiyat/teslimat hesapları packages/pricing'ten.
 */
@Module({
  controllers: [StorefrontController, AdminOrdersController],
  providers: [MarketService],
})
export class MarketModule {}
