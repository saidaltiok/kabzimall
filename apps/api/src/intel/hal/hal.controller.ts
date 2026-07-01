import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HalService } from './hal.service';
import { CreateHalEntryDto } from './dto/create-hal-entry.dto';
import { BulkHalDto } from './dto/bulk-hal.dto';

@ApiTags('intel: hal (günlük fiyat)')
@Controller('intel/hal')
export class HalController {
  constructor(private readonly service: HalService) {}

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
