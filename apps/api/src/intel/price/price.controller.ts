import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { PriceService } from './price.service';
import { ResolvePriceDto } from './dto/resolve-price.dto';

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
}
