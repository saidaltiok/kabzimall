import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JWT_SECRET } from '../auth/auth.constants';
import { CashModule } from '../cash/cash.module';
import { MarketService } from './market.service';
import { MailService } from './mail.service';
import { CustomerAuthService } from './customer-auth.service';
import { CouponService } from './coupon.service';
import { BannerService } from './banner.service';
import { SupportService } from './support.service';
import { CustomersService } from './customers.service';
import { StorefrontController, AdminOrdersController, DeliveryZonesController, AdminSettingsController, AdminCouponsController, AdminBannersController, AdminSupportController, AdminCustomersController } from './market.controller';

/**
 * Market — müşteri tarafı (Faz 1). Public vitrin + misafir sipariş (kapıda ödeme)
 * + admin sipariş yönetimi. Fiyat/teslimat hesapları packages/pricing'ten.
 */
@Module({
  imports: [JwtModule.register({ secret: JWT_SECRET }), CashModule], // OTP imzası + kasa hook'u (teslimat tahsilatı)
  controllers: [StorefrontController, AdminOrdersController, DeliveryZonesController, AdminSettingsController, AdminCouponsController, AdminBannersController, AdminSupportController, AdminCustomersController],
  providers: [MarketService, MailService, CustomerAuthService, CouponService, BannerService, SupportService, CustomersService],
})
export class MarketModule {}
