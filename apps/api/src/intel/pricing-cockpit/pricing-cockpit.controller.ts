import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { PricingCockpitService } from './pricing-cockpit.service';

@ApiTags('intel: fiyatlama kokpiti')
@Controller('intel/pricing-cockpit')
export class PricingCockpitController {
  constructor(private readonly service: PricingCockpitService) {}

  /** GET /intel/pricing-cockpit?days=30 — alış/hal/rakip/satış kıyas tablosu. */
  @Get()
  @Roles(...PRICE_WRITERS)
  @ApiQuery({ name: 'days', required: false })
  overview(@Query('days') days?: string) {
    return this.service.overview(days ? Math.min(365, Math.max(1, Number(days))) : 30);
  }

  /** GET /intel/pricing-cockpit/:slug?days=30 — tek ürün günlük trend serisi. */
  @Get(':slug')
  @Roles(...PRICE_WRITERS)
  @ApiQuery({ name: 'days', required: false })
  series(@Param('slug') slug: string, @Query('days') days?: string) {
    return this.service.series(slug, days ? Math.min(365, Math.max(1, Number(days))) : 30);
  }
}
