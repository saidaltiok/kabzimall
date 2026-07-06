import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';

@ApiTags('intel: rakipler')
@Controller('intel/competitors')
export class CompetitorsController {
  constructor(private readonly service: CompetitorsService) {}

  /** POST /api/v1/intel/competitors */
  @Post()
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { name: 'Market A', groupId: '<grup-uuid>', type: 'zincir' } } })
  create(@Body() dto: CreateCompetitorDto) {
    return this.service.createCompetitor(dto);
  }

  /** GET /api/v1/intel/competitors */
  @Get()
  async list() {
    const data = await this.service.listCompetitors();
    return { data, meta: { total: data.length } };
  }
}
