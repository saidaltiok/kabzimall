import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JWT_SECRET } from '../auth/auth.constants';
import { MarketService } from './market.service';
import { MailService } from './mail.service';
import { CustomerAuthService } from './customer-auth.service';
import { CouponService } from './coupon.service';
import { BannerService } from './banner.service';
import { StorefrontController, AdminOrdersController, DeliveryZonesController, AdminSettingsController, AdminCouponsController, AdminBannersController } from './market.controller';

/**
 * Market — müşteri tarafı (Faz 1). Public vitrin + misafir sipariş (kapıda ödeme)
 * + admin sipariş yönetimi. Fiyat/teslimat hesapları packages/pricing'ten.
 */
@Module({
  imports: [JwtModule.register({ secret: JWT_SECRET })], // müşteri OTP token imzası (kind: customer)
  controllers: [StorefrontController, AdminOrdersController, DeliveryZonesController, AdminSettingsController, AdminCouponsController, AdminBannersController],
  providers: [MarketService, MailService, CustomerAuthService, CouponService, BannerService],
})
export class MarketModule {}
