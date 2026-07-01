import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { MarketModule } from './market/market.module';
import { IntelModule } from './intel/intel.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, AuthModule, CatalogModule, MarketModule, IntelModule],
  controllers: [HealthController],
})
export class AppModule {}
