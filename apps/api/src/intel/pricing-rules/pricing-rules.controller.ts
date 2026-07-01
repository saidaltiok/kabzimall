import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { PricingRulesService } from './pricing-rules.service';
import { UpsertPricingRuleDto } from './dto/pricing-rule.dto';

@ApiTags('intel: fiyat kuralları')
@Controller('intel/pricing-rules')
export class PricingRulesController {
  constructor(private readonly service: PricingRulesService) {}

  @Get()
  async list() {
    const data = await this.service.list();
    return { data, meta: { total: data.length } };
  }

  /** GET /intel/pricing-rules/resolve?productId= — ürüne etkin kural (önizleme). */
  @Get('resolve')
  @ApiQuery({ name: 'productId', required: true })
  resolve(@Query('productId') productId: string) {
    return this.service.resolveEffective(productId);
  }

  /** PUT /intel/pricing-rules — kuralı oluştur/güncelle (scope+refId benzersiz). */
  @Put()
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { scope: 'CATEGORY', refId: 'sebze', floorMargin: 0.25, targetMargin: 0.3 } } })
  upsert(@Body() dto: UpsertPricingRuleDto) {
    return this.service.upsert(dto);
  }

  @Delete(':id')
  @Roles(...PRICE_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
