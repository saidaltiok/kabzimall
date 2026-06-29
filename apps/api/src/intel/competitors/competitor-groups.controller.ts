import { Body, Controller, Get, Post } from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorGroupDto } from './dto/create-competitor-group.dto';

@Controller('intel/competitor-groups')
export class CompetitorGroupsController {
  constructor(private readonly service: CompetitorsService) {}

  /** POST /api/v1/intel/competitor-groups */
  @Post()
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
