import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

/**
 * Intelligence tablolarını temizler (FK sırasına dikkat: önce price_history).
 * Her test dosyası beforeAll'da çağırır → testler izole çalışır.
 * UYARI: geliştirme veritabanını da temizler (iskelet — gerçek veri yok).
 */
export async function resetDb(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.priceHistory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.halPriceEntry.deleteMany();
  await prisma.halPurchase.deleteMany();
  await prisma.costPool.deleteMany();
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
