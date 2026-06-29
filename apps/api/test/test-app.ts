import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JWT_SECRET, type Role } from '../src/auth/auth.constants';
import { DEV_TENANT_ID } from '../src/common/tenant';

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
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.basketItem.deleteMany();
  await prisma.basketTemplate.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.halPriceEntry.deleteMany();
  await prisma.competitorPriceEntry.deleteMany();
  await prisma.competitor.deleteMany();
  await prisma.competitorGroup.deleteMany();
  await prisma.costComponent.deleteMany();
  await prisma.halPurchase.deleteMany();
  await prisma.costPool.deleteMany();
}

/** Geçerli bir JWT üretir (DB kullanıcısı gerekmez — guard stateless). */
export function tokenFor(app: INestApplication, role: Role = 'ADMIN'): string {
  return app.get(JwtService).sign(
    { sub: 'test-user', email: `${role.toLowerCase()}@test.local`, role, tenantId: DEV_TENANT_ID },
    { secret: JWT_SECRET },
  );
}

/** Authorization header'ı otomatik ekleyen supertest sarmalayıcısı. */
export function authed(app: INestApplication, role: Role = 'ADMIN') {
  const http = app.getHttpServer();
  const token = tokenFor(app, role);
  const wrap = (m: 'get' | 'post' | 'put' | 'patch' | 'delete') => (url: string) =>
    request(http)[m](url).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete'), http, token };
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
