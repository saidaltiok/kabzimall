import { Module } from '@nestjs/common';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';

/**
 * Kasa modülü — bağımsız; Market (teslim edilen sipariş → giriş) ve Intel
 * (hal alımı → çıkış) modülleri CashService'i import edip hook'lar.
 */
@Module({
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
