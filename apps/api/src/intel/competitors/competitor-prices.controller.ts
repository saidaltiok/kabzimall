import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { CompetitorsService } from './competitors.service';
import { MarketFiyatiService } from './market-fiyati.service';
import { ManavService } from './manav.service';
import { CompetitorSyncService } from './competitor-sync.service';
import { CreateCompetitorPriceDto } from './dto/create-competitor-price.dto';

@ApiTags('intel: rakipler')
@Controller('intel/competitor-prices')
export class CompetitorPricesController {
  constructor(
    private readonly service: CompetitorsService,
    private readonly marketFiyati: MarketFiyatiService,
    private readonly manav: ManavService,
    private readonly sync: CompetitorSyncService,
  ) {}

  /** POST /intel/competitor-prices/refresh-all — tüm otomatik kaynakları şimdi çek. */
  @Post('refresh-all')
  @Roles(...PRICE_WRITERS)
  refreshAll() {
    return this.sync.runAll();
  }

  /** GET /intel/competitor-prices/marketfiyati?keyword= — marketfiyati önizleme (kaydetmez). */
  @Get('marketfiyati')
  @ApiQuery({ name: 'keyword', required: true })
  mfPreview(@Query('keyword') keyword: string) {
    if (!keyword) throw new BadRequestException('keyword zorunludur');
    return this.marketFiyati.preview(keyword);
  }

  /** POST /intel/competitor-prices/marketfiyati/import { productId, keyword? } — çek + kaydet. */
  @Post('marketfiyati/import')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { productId: 'muz', keyword: 'muz' } } })
  mfImport(@Body('productId') productId: string, @Body('keyword') keyword?: string) {
    if (!productId) throw new BadRequestException('productId zorunludur');
    return this.marketFiyati.importForProduct(productId, keyword);
  }

  /**
   * POST /intel/competitor-prices/marketfiyati/bulk { slugs? }
   * Tüm katalog (ya da verilen slug'lar) için marketfiyati'ndan toplu çekim.
   */
  @Post('marketfiyati/bulk')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ required: false, schema: { example: { slugs: ['muz-yerli', 'patates'] } } })
  mfBulk(@Body('slugs') slugs?: string[]) {
    return this.marketFiyati.bulkImport(Array.isArray(slugs) ? slugs : undefined);
  }

  /** GET /intel/competitor-prices/manav — çekilebilir online manav siteleri. */
  @Get('manav')
  manavSites() {
    return this.manav.sites();
  }

  /** GET /intel/competitor-prices/manav/preview?site= — önizleme (kaydetmez). */
  @Get('manav/preview')
  @ApiQuery({ name: 'site', required: true })
  manavPreview(@Query('site') site: string) {
    if (!site) throw new BadRequestException('site zorunludur');
    return this.manav.preview(site);
  }

  /** POST /intel/competitor-prices/manav/import { site } — online manav fiyatlarını çek + kaydet. */
  @Post('manav/import')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { site: 'sebzemeyvedunyasi' } } })
  manavImport(@Body('site') site: string) {
    if (!site) throw new BadRequestException('site zorunludur');
    return this.manav.importSite(site);
  }

  /** GET /intel/competitor-prices/coverage — ürün başına rakip kapsamı (kesişim gücü). */
  @Get('coverage')
  coverage() {
    return this.service.coverage();
  }

  /**
   * POST /intel/competitor-prices/publish { slugs, basis? } — seçili ürünleri
   * yayına al (aktifle + rakip medyanı/min'ine göre başlangıç fiyatı ata).
   */
  @Post('publish')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { slugs: ['patates', 'portakal'], basis: 'median' } } })
  publish(@Body('slugs') slugs: string[], @Body('basis') basis?: 'median' | 'min') {
    return this.service.publishPopular(slugs, basis === 'min' ? 'min' : 'median');
  }

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
