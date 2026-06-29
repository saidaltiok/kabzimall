import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { IntelModule } from './intel/intel.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, IntelModule],
  controllers: [HealthController],
})
export class AppModule {}
