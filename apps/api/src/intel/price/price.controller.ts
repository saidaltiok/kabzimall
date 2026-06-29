import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { PriceService } from './price.service';
import { ResolvePriceDto } from './dto/resolve-price.dto';
import { SuggestPriceDto } from './dto/suggest-price.dto';
import { ApplyPriceDto } from './dto/apply-price.dto';

@Controller('intel/price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  /**
   * POST /api/v1/intel/price/resolve
   * Hiyerarşik fiyat çözümü: rakip yoksa hata yerine fallback zincirine düşer.
   * Yanıt: { price, netMargin, competitionIndex, directCost, floored,
   *          belowCost, strategy, usedFallback, opportunity, chainUsed }
   */
  @Post('resolve')
  @HttpCode(200)
  resolve(@Body() dto: ResolvePriceDto) {
    return { ...this.priceService.resolve(dto), currency: 'TRY-minor' };
  }

  /**
   * POST /api/v1/intel/price/suggest
   * Tek strateji ile öneri (fallback yok). Yanıt SuggestResult + currency.
   */
  @Post('suggest')
  @HttpCode(200)
  suggest(@Body() dto: SuggestPriceDto) {
    return { ...this.priceService.suggest(dto), currency: 'TRY-minor' };
  }

  /**
   * POST /api/v1/intel/price/apply
   * Seçilen fiyatı base_price olarak yayınlar + price_history'e yazar.
   * Yanıt: { product, history }
   */
  @Post('apply')
  @HttpCode(200)
  apply(@Body() dto: ApplyPriceDto) {
    return this.priceService.apply(dto);
  }

  /** GET /api/v1/intel/price/history?productId= */
  @Get('history')
  async history(@Query('productId') productId?: string) {
    const data = await this.priceService.findHistory(productId);
    return { data, meta: { total: data.length } };
  }
}
