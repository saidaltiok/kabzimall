import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { HalService } from './hal.service';
import { CreateHalEntryDto } from './dto/create-hal-entry.dto';
import { BulkHalDto } from './dto/bulk-hal.dto';

@Controller('intel/hal')
export class HalController {
  constructor(private readonly service: HalService) {}

  /**
   * POST /api/v1/intel/hal/entries
   * Tek günlük hal fiyatı ekler (append-only).
   */
  @Post('entries')
  create(@Body() dto: CreateHalEntryDto) {
    return this.service.create(dto);
  }

  /**
   * POST /api/v1/intel/hal/bulk
   * Saha Modu: birçok ürünün hal fiyatını tek seferde ekler.
   */
  @Post('bulk')
  bulk(@Body() dto: BulkHalDto) {
    return this.service.bulk(dto);
  }

  /**
   * GET /api/v1/intel/hal?date=YYYY-MM-DD
   * Ürün × gün ızgarası + günlük ortalama (date verilmezse bugün).
   */
  @Get()
  grid(@Query('date') date?: string) {
    return this.service.grid(date);
  }
}
