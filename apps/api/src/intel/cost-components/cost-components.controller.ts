import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { CostComponentsService } from './cost-components.service';
import { UpsertCostComponentDto } from './dto/upsert-cost-component.dto';

@Controller('intel/cost-components')
export class CostComponentsController {
  constructor(private readonly service: CostComponentsService) {}

  /** PUT /api/v1/intel/cost-components — maliyet bileşeni oluştur/güncelle. */
  @Put()
  @HttpCode(200)
  upsert(@Body() dto: UpsertCostComponentDto) {
    return this.service.upsert(dto);
  }

  /** GET /api/v1/intel/cost-components */
  @Get()
  async list() {
    const data = await this.service.list();
    return { data, meta: { total: data.length } };
  }
}

@Controller('intel/cost')
export class CostController {
  constructor(private readonly service: CostComponentsService) {}

  /**
   * GET /api/v1/intel/cost/:productId?halAvg=
   * Ürün için etkin maliyet + directCost kırılımı (Teknik doküman Bölüm 5.5).
   * halAvg verilmezse ürünün en güncel günlük hal ortalaması kullanılır.
   */
  @Get(':productId')
  cost(@Param('productId') productId: string, @Query('halAvg') halAvg?: string) {
    let override: number | undefined;
    if (halAvg !== undefined) {
      override = Number(halAvg);
      if (!Number.isInteger(override) || override < 0) {
        throw new BadRequestException('halAvg negatif olmayan tam sayı (kuruş) olmalı');
      }
    }
    return this.service.costForProduct(productId, override);
  }
}
