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
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { CostComponentsService } from './cost-components.service';
import { UpsertCostComponentDto } from './dto/upsert-cost-component.dto';

@ApiTags('intel: maliyet')
@Controller('intel/cost-components')
export class CostComponentsController {
  constructor(private readonly service: CostComponentsService) {}

  /** PUT /api/v1/intel/cost-components — maliyet bileşeni oluştur/güncelle. */
  @Put()
  @HttpCode(200)
  @Roles(...PRICE_WRITERS)
  @ApiBody({
    schema: {
      example: { scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 },
    },
  })
  upsert(@Body() dto: UpsertCostComponentDto) {
    return this.service.upsert(dto);
  }

  /** GET /api/v1/intel/cost-components */
  @Get()
  async list() {
    const data = await this.service.list();
    return { data, meta: { total: data.length } };
  }

  /** GET /api/v1/intel/cost-components/table — toplu tablo: ürün × etkin girdiler + birim maliyet. */
  @Get('table')
  async table() {
    const data = await this.service.table();
    return { data, meta: { total: data.length } };
  }
}

@ApiTags('intel: maliyet')
@Controller('intel/cost')
export class CostController {
  constructor(private readonly service: CostComponentsService) {}

  /**
   * GET /api/v1/intel/cost/:productId?halAvg=
   * Ürün için etkin maliyet + directCost kırılımı (Teknik doküman Bölüm 5.5).
   * halAvg verilmezse ürünün en güncel günlük hal ortalaması kullanılır.
   */
  @Get(':productId')
  @ApiQuery({ name: 'halAvg', required: false, example: 1870 })
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
