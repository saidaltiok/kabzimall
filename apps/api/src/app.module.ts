import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { IntelModule } from './intel/intel.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule, CatalogModule, IntelModule],
  controllers: [HealthController],
})
export class AppModule {}
