import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorGroupDto } from './dto/create-competitor-group.dto';

@ApiTags('intel: rakipler')
@Controller('intel/competitor-groups')
export class CompetitorGroupsController {
  constructor(private readonly service: CompetitorsService) {}

  /** POST /api/v1/intel/competitor-groups */
  @Post()
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { name: 'Orta', sortOrder: 1 } } })
  create(@Body() dto: CreateCompetitorGroupDto) {
    return this.service.createGroup(dto);
  }

  /** GET /api/v1/intel/competitor-groups */
  @Get()
  async list() {
    const data = await this.service.listGroups();
    return { data, meta: { total: data.length } };
  }
}
