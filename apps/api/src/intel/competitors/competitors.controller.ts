import { Body, Controller, Get, Post } from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';

@Controller('intel/competitors')
export class CompetitorsController {
  constructor(private readonly service: CompetitorsService) {}

  /** POST /api/v1/intel/competitors */
  @Post()
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
