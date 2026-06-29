import { Module } from '@nestjs/common';
import { IntelModule } from './intel/intel.module';
import { HealthController } from './health.controller';

@Module({
  imports: [IntelModule],
  controllers: [HealthController],
})
export class AppModule {}
