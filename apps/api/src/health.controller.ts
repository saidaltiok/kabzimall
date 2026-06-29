import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators';

@ApiTags('sağlık')
@Controller()
export class HealthController {
  @Public()
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
