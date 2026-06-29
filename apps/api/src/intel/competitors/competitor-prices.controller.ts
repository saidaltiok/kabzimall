import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorPriceDto } from './dto/create-competitor-price.dto';

@Controller('intel/competitor-prices')
export class CompetitorPricesController {
  constructor(private readonly service: CompetitorsService) {}

  /** POST /api/v1/intel/competitor-prices/entries */
  @Post('entries')
  create(@Body() dto: CreateCompetitorPriceDto) {
    return this.service.createPrice(dto);
  }

  /**
   * GET /api/v1/intel/competitor-prices?productId=&date=
   * Ürünün rakip fiyatları + min/max/avg/median (rakip başına en güncel).
   */
  @Get()
  prices(@Query('productId') productId?: string, @Query('date') date?: string) {
    if (!productId) throw new BadRequestException('productId zorunludur');
    return this.service.pricesFor(productId, date);
  }
}
