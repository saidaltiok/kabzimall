import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('sağlık')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Veritabanına gerçekten dokunur — PM2/izleme "yaşıyor ama DB kopuk" durumunu yakalasın. */
  @Public()
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ service: 'kabzimall-intelligence-api', status: 'db-down' });
    }
    return {
      service: 'kabzimall-intelligence-api',
      status: 'ok',
      currency: 'TRY-minor',
      time: new Date().toISOString(),
    };
  }
}
