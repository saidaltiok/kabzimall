import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { AiBriefService } from './ai-brief.service';

@ApiTags('intel: AI günlük özet')
@Controller('intel/ai')
export class AiBriefController {
  constructor(private readonly service: AiBriefService) {}

  /** GET /intel/ai/daily-brief?force=1 — günde bir üretilir (force ile tazele). */
  @Get('daily-brief')
  @ApiQuery({ name: 'force', required: false })
  brief(@Query('force') force?: string) {
    return this.service.dailyBrief(force === '1' || force === 'true');
  }
}
