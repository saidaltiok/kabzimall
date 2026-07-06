import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { FinanceService, type OverheadInput } from './finance.service';

@ApiTags('intel: finans (genel gider + kâr/zarar)')
@Controller('intel/finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  /** GET /intel/finance/overheads — üründen bağımsız genel giderler. */
  @Get('overheads')
  async overheads() {
    const data = await this.service.listOverheads();
    return { data, meta: { total: data.length } };
  }

  @Post('overheads')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { name: 'Kira', category: 'RENT', kind: 'FIXED', amount: 2000000, period: 'MONTHLY' } } })
  create(@Body() dto: OverheadInput) {
    return this.service.createOverhead(dto);
  }

  @Patch('overheads/:id')
  @Roles(...PRICE_WRITERS)
  update(@Param('id') id: string, @Body() dto: Partial<OverheadInput>) {
    return this.service.updateOverhead(id, dto);
  }

  @Delete('overheads/:id')
  @Roles(...PRICE_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.removeOverhead(id);
  }

  /** GET /intel/finance/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD — tarih aralığı kâr/zarar. */
  @Get('pnl')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  pnl(@Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) throw new BadRequestException('from ve to zorunlu (YYYY-MM-DD).');
    return this.service.profitLoss(from, to);
  }
}
