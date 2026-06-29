import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb } from './test-app';

describe('Intel /price/bulk-apply', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const DATE = '2026-06-29';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = app.getHttpServer();

    await request(http)
      .put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 });
    await request(http).post('/api/v1/intel/hal/entries').send({ productId: 'domates', price: 1870, date: DATE });
    await request(http).post('/api/v1/intel/hal/entries').send({ productId: 'patates', price: 2000, date: DATE });
    // 'erik' için maliyet (GLOBAL) var ama hal yok → skipped beklenir
  });

  afterAll(async () => {
    await app.close();
  });

  it('önizleme (commit=false): öner ama uygulama, eksik ürün skipped', async () => {
    const res = await request(http)
      .post('/api/v1/intel/price/bulk-apply')
      .send({ productIds: ['domates', 'patates', 'erik'], strategy: 'MARGIN', params: { targetMargin: 0.3 }, date: DATE })
      .expect(200);

    expect(res.body.committed).toBe(false);
    expect(res.body.total).toBe(3);
    expect(res.body.skipped).toBe(1);

    const byId: Record<string, any> = {};
    for (const r of res.body.results) byId[r.productId] = r;

    expect(byId['domates'].suggestedPrice).toBe(3590);
    expect(byId['domates'].applied).toBe(false);
    expect(byId['domates'].currentPrice).toBeNull(); // henüz uygulanmadı
    expect(byId['patates'].suggestedPrice).toBeGreaterThan(0);
    expect(byId['erik'].skipped).toBe(true); // hal yok
  });

  it('önizleme hiçbir şey yazmadı (history boş)', async () => {
    const h = await request(http).get('/api/v1/intel/price/history').expect(200);
    expect(h.body.meta.total).toBe(0);
  });

  it('commit=true: gerçekten uygular → history + base_price', async () => {
    const res = await request(http)
      .post('/api/v1/intel/price/bulk-apply')
      .send({ productIds: ['domates', 'patates'], strategy: 'MARGIN', params: { targetMargin: 0.3 }, date: DATE, commit: true })
      .expect(200);

    expect(res.body.committed).toBe(true);
    expect(res.body.applied).toBe(2);

    const h = await request(http).get('/api/v1/intel/price/history?productId=domates').expect(200);
    expect(h.body.meta.total).toBe(1);
    expect(h.body.data[0].newPrice).toBe(3590);
    expect(h.body.data[0].reason).toBe('Toplu güncelleme');
  });

  it('geçersiz strateji → 400', async () => {
    await request(http)
      .post('/api/v1/intel/price/bulk-apply')
      .send({ productIds: ['domates'], strategy: 'YOK' })
      .expect(400);
  });
});
