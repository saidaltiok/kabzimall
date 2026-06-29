import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { ResolvePriceDto } from './dto/resolve-price.dto';
import { SuggestPriceDto } from './dto/suggest-price.dto';
import { ApplyPriceDto } from './dto/apply-price.dto';
import { SuggestProductDto } from './dto/suggest-product.dto';
import { ResolveProductDto } from './dto/resolve-product.dto';
import { BulkApplyDto } from './dto/bulk-apply.dto';

// Swagger "Try it out" için hazır örnek gövdeler (kuruş).
const COST_EXAMPLE = {
  halAvg: 1870,
  fireRate: 0.15,
  labor: 120,
  packaging: 70,
  fuel: 50,
  commissionRate: 0.03,
};

@ApiTags('intel: fiyat')
@Controller('intel/price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  /**
   * POST /api/v1/intel/price/resolve
   * Hiyerarşik fiyat çözümü: rakip yoksa hata yerine fallback zincirine düşer.
   */
  @Post('resolve')
  @HttpCode(200)
  @ApiBody({ schema: { example: { cost: COST_EXAMPLE, baseParams: { targetMargin: 0.3, floorMargin: 0.15 } } } })
  resolve(@Body() dto: ResolvePriceDto) {
    return { ...this.priceService.resolve(dto), currency: 'TRY-minor' };
  }

  /**
   * POST /api/v1/intel/price/suggest
   * Tek strateji ile öneri (fallback yok).
   */
  @Post('suggest')
  @HttpCode(200)
  @ApiBody({ schema: { example: { cost: COST_EXAMPLE, strategy: 'MARGIN', params: { targetMargin: 0.3 } } } })
  suggest(@Body() dto: SuggestPriceDto) {
    return { ...this.priceService.suggest(dto), currency: 'TRY-minor' };
  }

  /**
   * POST /api/v1/intel/price/suggest-product
   * Sadece productId + strateji ile öneri; maliyet (cost-components + günlük
   * hal ort.) ve rakipler DB'den toplanır.
   */
  @Post('suggest-product')
  @HttpCode(200)
  @ApiBody({ schema: { example: { productId: 'domates', strategy: 'MARGIN', params: { targetMargin: 0.3 } } } })
  async suggestProduct(@Body() dto: SuggestProductDto) {
    return { ...(await this.priceService.suggestForProduct(dto)), currency: 'TRY-minor' };
  }

  /**
   * POST /api/v1/intel/price/resolve-product
   * productId ile hiyerarşik çözüm (fallback zinciri); girdiler DB'den.
   */
  @Post('resolve-product')
  @HttpCode(200)
  @ApiBody({ schema: { example: { productId: 'domates' } } })
  async resolveProduct(@Body() dto: ResolveProductDto) {
    return { ...(await this.priceService.resolveForProduct(dto)), currency: 'TRY-minor' };
  }

  /**
   * POST /api/v1/intel/price/apply
   * Seçilen fiyatı base_price olarak yayınlar + price_history'e yazar.
   */
  @Post('apply')
  @HttpCode(200)
  @ApiBody({ schema: { example: { productId: 'domates', price: 3590, strategy: 'MARGIN', netMargin: 0.29, reason: 'İlk yayın' } } })
  apply(@Body() dto: ApplyPriceDto) {
    return this.priceService.apply(dto);
  }

  /**
   * POST /api/v1/intel/price/bulk-apply
   * Birçok ürüne stratejiyi uygula. Varsayılan önizleme; commit=true ile yaz.
   */
  @Post('bulk-apply')
  @HttpCode(200)
  @ApiBody({
    schema: {
      example: { productIds: ['domates', 'patates'], strategy: 'MARGIN', params: { targetMargin: 0.3 }, commit: false },
    },
  })
  bulkApply(@Body() dto: BulkApplyDto) {
    return this.priceService.bulkApply(dto);
  }

  /** GET /api/v1/intel/price/history?productId= */
  @Get('history')
  @ApiQuery({ name: 'productId', required: false })
  async history(@Query('productId') productId?: string) {
    const data = await this.priceService.findHistory(productId);
    return { data, meta: { total: data.length } };
  }
}
