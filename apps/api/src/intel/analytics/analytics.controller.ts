import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('intel: satış analizi')
@Controller('intel/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /** GET /intel/analytics/sales?productId=&days=30 — günlük satış serisi + özet. */
  @Get('sales')
  @ApiQuery({ name: 'productId', required: true })
  @ApiQuery({ name: 'days', required: false })
  sales(@Query('productId') productId?: string, @Query('days') days?: string) {
    if (!productId) throw new BadRequestException('productId zorunludur');
    return this.service.salesSeries(productId, days ? Number(days) : 30);
  }

  /** GET /intel/analytics/overview?days=7 — mağaza geneli günlük ciro/sipariş serisi. */
  @Get('overview')
  @ApiQuery({ name: 'days', required: false })
  overview(@Query('days') days?: string) {
    return this.service.overview(days ? Number(days) : 7);
  }

  /** GET /intel/analytics/price-movers?days=30 — fiyat hareketliliği (volatilite + ısı haritası verisi). */
  @Get('price-movers')
  @ApiQuery({ name: 'days', required: false })
  priceMovers(@Query('days') days?: string) {
    return this.service.priceMovers(days ? Number(days) : 30);
  }

  /** GET /intel/analytics/basket-affinity?days=90 — birlikte-satın-alma + önerilen sepet. */
  @Get('basket-affinity')
  @ApiQuery({ name: 'days', required: false })
  basketAffinity(@Query('days') days?: string) {
    return this.service.basketAffinity(days ? Number(days) : 90);
  }

  /** GET /intel/analytics/elasticity?productId=&window=14 — fiyat esnekliği. */
  @Get('elasticity')
  @ApiQuery({ name: 'productId', required: true })
  @ApiQuery({ name: 'window', required: false })
  elasticity(@Query('productId') productId?: string, @Query('window') windowDays?: string) {
    if (!productId) throw new BadRequestException('productId zorunludur');
    return this.service.elasticity(productId, windowDays ? Number(windowDays) : 14);
  }
}
