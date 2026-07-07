import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators';
import { ORDER_WRITERS, type JwtUser } from '../auth/auth.constants';
import { CashService, type MovementInput } from './cash.service';

@ApiTags('kasa')
@Controller('admin/cash')
export class CashController {
  constructor(private readonly service: CashService) {}

  /** GET /admin/cash/current — açık oturum + hareketler + anlık bakiye (para verisi: dar erişim). */
  @Get('current')
  @Roles('ADMIN', 'OPERATION')
  current() {
    return this.service.current();
  }

  /** POST /admin/cash/open { openingFloat (kuruş), note? } */
  @Post('open')
  @Roles(...ORDER_WRITERS)
  @ApiBody({ schema: { example: { openingFloat: 50000, note: 'Sabah açılışı' } } })
  open(@Body() dto: { openingFloat: number; note?: string }, @CurrentUser() user: JwtUser) {
    return this.service.open(dto.openingFloat, user?.email, dto.note);
  }

  /** POST /admin/cash/movements { type: IN|OUT, category?, amount (kuruş), note?, refCode? } */
  @Post('movements')
  @Roles(...ORDER_WRITERS)
  @ApiBody({ schema: { example: { type: 'OUT', category: 'EXPENSE', amount: 15000, note: 'Poşet alımı' } } })
  movement(@Body() dto: MovementInput, @CurrentUser() user: JwtUser) {
    return this.service.addMovement(dto, user?.email);
  }

  /** POST /admin/cash/close { counted (kuruş), note? } — beklenen/fark hesaplanır. */
  @Post('close')
  @Roles(...ORDER_WRITERS)
  @ApiBody({ schema: { example: { counted: 128500 } } })
  close(@Body() dto: { counted: number; note?: string }, @CurrentUser() user: JwtUser) {
    return this.service.close(dto.counted, user?.email, dto.note);
  }

  /** GET /admin/cash/sessions?limit=30 — oturum geçmişi + özetler (para verisi: dar erişim). */
  @Get('sessions')
  @Roles('ADMIN', 'OPERATION')
  @ApiQuery({ name: 'limit', required: false })
  async sessions(@Query('limit') limit?: string) {
    const data = await this.service.sessions(limit ? Number(limit) : 30);
    return { data, meta: { total: data.length } };
  }
}
