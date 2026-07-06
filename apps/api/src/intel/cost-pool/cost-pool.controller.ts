import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { CostPoolService } from './cost-pool.service';
import { CreateCostPoolDto } from './dto/create-cost-pool.dto';

@ApiTags('intel: maliyet havuzu')
@Controller('intel/cost-pool')
export class CostPoolController {
  constructor(private readonly service: CostPoolService) {}

  /**
   * POST /api/v1/intel/cost-pool
   * Havuz/dağıtımlı maliyetleri (işçilik, yakıt…) toplam hacme bölerek
   * kg başına tahsis üretir (karar #9). previewProduct verilirse
   * packages/pricing.directCost ile tam birim maliyet önizlemesi döner.
   */
  @Post()
  @Roles(...PRICE_WRITERS)
  @ApiBody({
    schema: {
      example: {
        period: '2026-06',
        totalLabor: 5000000,
        totalFuel: 2000000,
        totalVolumeKg: 10000,
        previewProduct: { halAvg: 1870, fireRate: 0.15, packaging: 70, commissionRate: 0.03 },
      },
    },
  })
  create(@Body() dto: CreateCostPoolDto) {
    return this.service.create(dto);
  }

  /** GET /api/v1/intel/cost-pool?period= */
  @Get()
  @ApiQuery({ name: 'period', required: false, example: '2026-06' })
  async findAll(@Query('period') period?: string) {
    const data = await this.service.findAll(period);
    return { data, meta: { total: data.length } };
  }

  /** GET /api/v1/intel/cost-pool/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
