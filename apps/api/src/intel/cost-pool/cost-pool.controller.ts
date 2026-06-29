import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CostPoolService } from './cost-pool.service';
import { CreateCostPoolDto } from './dto/create-cost-pool.dto';

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
  create(@Body() dto: CreateCostPoolDto) {
    return this.service.create(dto);
  }

  /** GET /api/v1/intel/cost-pool?period= */
  @Get()
  findAll(@Query('period') period?: string) {
    const data = this.service.findAll(period);
    return { data, meta: { total: data.length } };
  }

  /** GET /api/v1/intel/cost-pool/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
