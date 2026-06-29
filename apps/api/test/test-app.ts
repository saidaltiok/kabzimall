import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

/**
 * Üretimdeki main.ts ile AYNI yapılandırmada bir test uygulaması kurar
 * (global prefix /api/v1 + whitelist/transform ValidationPipe), böylece
 * testler gerçek davranışı doğrular. Her test dosyası kendi örneğini
 * kurduğundan bellek içi store'lar dosyalar arası izole kalır.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

/** Referans Domates girdisi (Teknik doküman Bölüm 4.3). */
export const DOMATES_COST = {
  halAvg: 1870,
  fireRate: 0.15,
  labor: 120,
  packaging: 70,
  fuel: 50,
  commissionRate: 0.03,
};
