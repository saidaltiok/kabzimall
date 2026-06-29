import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global: tüm modüller PrismaService'i import etmeden enjekte edebilir. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
