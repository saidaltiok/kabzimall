import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { MarkdownService, type MarkdownRuleInput } from './markdown.service';

@ApiTags('intel: otomatik indirim (clearance)')
@Controller('intel/markdown')
export class MarkdownController {
  constructor(private readonly service: MarkdownService) {}

  /** GET /intel/markdown/rules — tanımlı kurallar. */
  @Get('rules')
  async rules() {
    const data = await this.service.listRules();
    return { data, meta: { total: data.length } };
  }

  /** PUT /intel/markdown/rules — kural ekle/güncelle (scope+refId benzersiz). */
  @Put('rules')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { scope: 'CATEGORY', refId: 'sebze', mode: 'PRICE_DECAY', pct: 0.05, staleDays: 2, allowBelowCost: false, maxTotalOffPct: 0.5 } } })
  upsert(@Body() dto: MarkdownRuleInput) {
    return this.service.upsertRule(dto);
  }

  @Delete('rules/:id')
  @Roles(...PRICE_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.removeRule(id);
  }

  /** GET /intel/markdown/upcoming — bugün inecekler + 2 gün içinde eriyecekler (Bugün ekranı uyarısı). */
  @Get('upcoming')
  upcoming() {
    return this.service.upcoming();
  }

  /** POST /intel/markdown/run?dry=1 — koşuyu tetikle (dry=1: yalnız önizleme). */
  @Post('run')
  @Roles(...PRICE_WRITERS)
  @ApiQuery({ name: 'dry', required: false })
  run(@Query('dry') dry?: string) {
    return this.service.run(dry === '1' || dry === 'true');
  }
}
