import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('intel: dashboard')
@Controller('intel/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * GET /api/v1/intel/dashboard?date=YYYY-MM-DD
   * KPI'lar + riskli ürünler + son fiyat değişiklikleri (date verilmezse bugün).
   */
  @Get()
  @ApiQuery({ name: 'date', required: false, example: '2026-06-29' })
  overview(@Query('date') date?: string) {
    return this.service.overview(date);
  }
}
