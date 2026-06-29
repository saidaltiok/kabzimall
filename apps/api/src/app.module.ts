import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { IntelModule } from './intel/intel.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule, IntelModule],
  controllers: [HealthController],
})
export class AppModule {}
