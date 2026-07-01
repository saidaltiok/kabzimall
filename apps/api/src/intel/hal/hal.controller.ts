import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { HalService } from './hal.service';
import { IbbHalService } from './ibb-hal.service';
import { CreateHalEntryDto } from './dto/create-hal-entry.dto';
import { BulkHalDto } from './dto/bulk-hal.dto';

@ApiTags('intel: hal (günlük fiyat)')
@Controller('intel/hal')
export class HalController {
  constructor(private readonly service: HalService, private readonly ibb: IbbHalService) {}

  /** GET /intel/hal/ibb/preview?date=&category= — İBB günlük fiyatları + slug eşleme önizleme. */
  @Get('ibb/preview')
  @ApiQuery({ name: 'date', required: true })
  @ApiQuery({ name: 'category', required: false, description: '5=Meyve, 6=Sebze, 7=İthal (boş=hepsi)' })
  @ApiQuery({ name: 'side', required: false, description: 'avrupa (varsayılan) | anadolu' })
  ibbPreview(@Query('date') date: string, @Query('category') category?: string, @Query('side') side?: string) {
    return this.ibb.preview(date, category, side);
  }

  /** POST /intel/hal/ibb/import { date, category?, createMissing? } — tüm İBB ürünlerini içeri al (eksikleri oluştur + fiyat yaz). */
  @Post('ibb/import')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { date: '2026-07-01', createMissing: true, side: 'avrupa' } } })
  ibbImport(@Body('date') date: string, @Body('category') category?: string, @Body('createMissing') createMissing?: boolean, @Body('side') side?: string) {
    return this.ibb.importAll(date, { category, createMissing, side });
  }

  /** GET /intel/hal/ibb/mappings — İBB ürün adı → slug eşlemeleri. */
  @Get('ibb/mappings')
  async ibbMappings() {
    const data = await this.ibb.listMappings();
    return { data, meta: { total: data.length } };
  }

  /** PUT /intel/hal/ibb/mappings { sourceName, productSlug } */
  @Put('ibb/mappings')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { sourceName: 'Çilek', productSlug: 'cilek' } } })
  ibbUpsertMapping(@Body('sourceName') sourceName: string, @Body('productSlug') productSlug: string) {
    return this.ibb.upsertMapping(sourceName, productSlug);
  }

  @Delete('ibb/mappings/:id')
  @Roles(...PRICE_WRITERS)
  ibbRemoveMapping(@Param('id') id: string) {
    return this.ibb.removeMapping(id);
  }

  /**
   * POST /api/v1/intel/hal/entries
   * Tek günlük hal fiyatı ekler (append-only).
   */
  @Post('entries')
  @ApiBody({ schema: { example: { productId: 'domates', price: 1870, date: '2026-06-29', source: 'MANUAL' } } })
  create(@Body() dto: CreateHalEntryDto) {
    return this.service.create(dto);
  }

  /**
   * POST /api/v1/intel/hal/bulk
   * Saha Modu: birçok ürünün hal fiyatını tek seferde ekler.
   */
  @Post('bulk')
  @ApiBody({
    schema: {
      example: {
        date: '2026-06-29',
        entries: [
          { productId: 'salatalik', price: 1200 },
          { productId: 'biber', price: 2400 },
        ],
      },
    },
  })
  bulk(@Body() dto: BulkHalDto) {
    return this.service.bulk(dto);
  }

  /**
   * GET /api/v1/intel/hal?date=YYYY-MM-DD
   * Ürün × gün ızgarası + günlük ortalama (date verilmezse bugün).
   */
  @Get()
  @ApiQuery({ name: 'date', required: false, example: '2026-06-29' })
  grid(@Query('date') date?: string) {
    return this.service.grid(date);
  }

  /**
   * GET /api/v1/intel/hal/previous?date=YYYY-MM-DD
   * Saha Modu: verilen günden önceki en güncel fiyat (ürün başına) —
   * "dünden kopyala" ön-doldurma + aykırı değer uyarısı için taban.
   */
  @Get('previous')
  @ApiQuery({ name: 'date', required: false })
  previous(@Query('date') date?: string) {
    return this.service.previous(date);
  }
}
