import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { StorefrontController, AdminOrdersController, DeliveryZonesController, AdminSettingsController } from './market.controller';

/**
 * Market — müşteri tarafı (Faz 1). Public vitrin + misafir sipariş (kapıda ödeme)
 * + admin sipariş yönetimi. Fiyat/teslimat hesapları packages/pricing'ten.
 */
@Module({
  controllers: [StorefrontController, AdminOrdersController, DeliveryZonesController, AdminSettingsController],
  providers: [MarketService],
})
export class MarketModule {}
