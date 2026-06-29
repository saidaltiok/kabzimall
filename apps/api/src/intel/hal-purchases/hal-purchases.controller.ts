import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { HalPurchasesService } from './hal-purchases.service';
import { CreateHalPurchaseDto } from './dto/create-hal-purchase.dto';

@Controller('intel/hal-purchases')
export class HalPurchasesController {
  constructor(private readonly service: HalPurchasesService) {}

  /**
   * POST /api/v1/intel/hal-purchases
   * Hal alımını kaydeder; ±500 g tartı mutabakatını (efektif kg maliyeti)
   * ve tartı hassasiyeti riskini packages/pricing ile hesaplar.
   */
  @Post()
  create(@Body() dto: CreateHalPurchaseDto) {
    return this.service.create(dto);
  }

  /** GET /api/v1/intel/hal-purchases?productId= */
  @Get()
  findAll(@Query('productId') productId?: string) {
    const data = this.service.findAll(productId);
    return { data, meta: { total: data.length } };
  }

  /** GET /api/v1/intel/hal-purchases/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
