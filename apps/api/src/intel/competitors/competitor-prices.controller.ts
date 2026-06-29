import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorPriceDto } from './dto/create-competitor-price.dto';

@ApiTags('intel: rakipler')
@Controller('intel/competitor-prices')
export class CompetitorPricesController {
  constructor(private readonly service: CompetitorsService) {}

  /** POST /api/v1/intel/competitor-prices/entries */
  @Post('entries')
  @ApiBody({ schema: { example: { productId: 'domates', competitorId: '<rakip-uuid>', price: 4200, date: '2026-06-29' } } })
  create(@Body() dto: CreateCompetitorPriceDto) {
    return this.service.createPrice(dto);
  }

  /**
   * GET /api/v1/intel/competitor-prices?productId=&date=
   * Ürünün rakip fiyatları + min/max/avg/median (rakip başına en güncel).
   */
  @Get()
  @ApiQuery({ name: 'productId', required: true, example: 'domates' })
  @ApiQuery({ name: 'date', required: false, example: '2026-06-29' })
  prices(@Query('productId') productId?: string, @Query('date') date?: string) {
    if (!productId) throw new BadRequestException('productId zorunludur');
    return this.service.pricesFor(productId, date);
  }
}
