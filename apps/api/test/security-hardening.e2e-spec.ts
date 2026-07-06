import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Güvenlik sertleştirme (rol + rate limit)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let viewer: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    admin = authed(app, 'ADMIN');
    viewer = authed(app, 'VIEWER');
    server = app.getHttpServer();
  });
  afterAll(async () => { await app.close(); });

  describe('Intel yazma uçları rol ister (yetki yükseltme kapalı)', () => {
    it('VIEWER hal fiyatı / rakip / maliyet havuzu / hal alımı YAZAMAZ (403)', async () => {
      await viewer.post('/api/v1/intel/hal/entries').send({ productId: 'x', price: 1000, date: TODAY }).expect(403);
      await viewer.post('/api/v1/intel/hal/bulk').send({ date: TODAY, entries: [] }).expect(403);
      await viewer.post('/api/v1/intel/competitor-groups').send({ name: 'G' }).expect(403);
      await viewer.post('/api/v1/intel/competitors').send({ name: 'R', groupId: 'x' }).expect(403);
      await viewer.post('/api/v1/intel/competitor-prices/entries').send({ productId: 'x', competitorId: 'y', price: 1, date: TODAY }).expect(403);
      await viewer.post('/api/v1/intel/hal-purchases').send({ productId: 'x', recordedKg: 1, totalPaid: 1000 }).expect(403);
      await viewer.post('/api/v1/intel/cost-pool').send({ label: 'x', totalCost: 1, totalKg: 1 }).expect(403);
    });

    it('ADMIN aynı uçlara yazabilir (rol geçişi doğru)', async () => {
      await admin.post('/api/v1/intel/competitor-groups').send({ name: 'Güvenlik Grubu' }).expect(201);
      await admin.post('/api/v1/intel/hal/entries').send({ productId: 'sec-domates', price: 2000, date: TODAY }).expect(201);
    });

    it('hesaplama uçları (mutasyonsuz) role bakılmaksızın erişilebilir', async () => {
      // suggest yalnız hesap yapar, DB yazmaz → VIEWER da çağırabilir
      await viewer.post('/api/v1/intel/price/suggest').send({ cost: { halAvg: 2000, fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0 }, strategy: 'FLOOR' }).expect(200);
    });
  });

  describe('Personel login kaba-kuvvet koruması', () => {
    it('IP başına çok sayıda başarısız denemeden sonra 429', async () => {
      // 10 başarısız (401) → 11. istek 429
      for (let i = 0; i < 10; i++) {
        await request(server).post('/api/v1/auth/login').send({ email: 'admin@kabzimall.local', password: 'yanlis' }).expect(401);
      }
      await request(server).post('/api/v1/auth/login').send({ email: 'admin@kabzimall.local', password: 'yanlis' }).expect(429);
      // doğru parola da artık pencere dolu → 429 (koruma aktif)
      await request(server).post('/api/v1/auth/login').send({ email: 'admin@kabzimall.local', password: 'kabzimall123' }).expect(429);
    });
  });
});
