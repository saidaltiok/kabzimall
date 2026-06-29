import { Controller, Get } from '@nestjs/common';

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
