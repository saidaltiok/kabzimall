import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('sağlık')
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      service: 'kabzimall-intelligence-api',
      status: 'ok',
      currency: 'TRY-minor',
      time: new Date().toISOString(),
    };
  }
}
