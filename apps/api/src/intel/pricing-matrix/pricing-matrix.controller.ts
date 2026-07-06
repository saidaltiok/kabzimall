import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../auth/decorators';
import { PRICE_WRITERS, type JwtUser } from '../../auth/auth.constants';
import { PricingMatrixService } from './pricing-matrix.service';

@ApiTags('intel: fiyat matrisi')
@Controller('intel/pricing-matrix')
export class PricingMatrixController {
  constructor(private readonly service: PricingMatrixService) {}

  /** GET /intel/pricing-matrix?date= — ürün × (hal/rakip/ort/medyan/öneri/durum) matrisi. */
  @Get()
  @ApiQuery({ name: 'date', required: false })
  matrix(@Query('date') date?: string) {
    return this.service.matrix(date);
  }

  /** POST /intel/pricing-matrix/publish — { items:[{slug,price}], allowBelowFloor? } toplu yayın. */
  @Post('publish')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { items: [{ slug: 'domates', price: 3990 }], allowBelowFloor: false } } })
  publish(
    @Body() dto: { items: { slug: string; price: number }[]; allowBelowFloor?: boolean },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.publish(dto.items ?? [], !!dto.allowBelowFloor, user.email);
  }
}
