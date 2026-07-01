import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Intel /analytics (satış analizi)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    // fiyatlı, yayında domates + 2 sipariş (bugün)
    await http.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 }).expect(201);
    const cust = { name: 'Analiz', phone: '05551110055', address: 'Adres 1' };
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 2 }], customer: cust }).expect(201);
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 3 }], customer: cust }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('satış serisi: günlük birim + sipariş + ciro toplamı (iptaller hariç)', async () => {
    const res = await http.get('/api/v1/intel/analytics/sales?productId=domates&days=30').expect(200);
    expect(res.body.summary.totalUnits).toBe(5); // 2 + 3
    expect(res.body.summary.totalRevenue).toBe(17950); // 7180 + 10770
    expect(res.body.series.length).toBeGreaterThanOrEqual(1);
    const today = res.body.series[res.body.series.length - 1];
    expect(today.orders).toBe(2);
    expect(today.units).toBe(5);
  });

  it('satış serisi: hiç siparişi olmayan ürün → boş seri', async () => {
    const res = await http.get('/api/v1/intel/analytics/sales?productId=muz').expect(200);
    expect(res.body.series).toHaveLength(0);
    expect(res.body.summary.totalUnits).toBe(0);
  });

  it('esneklik: fiyat geçmişi yoksa available=false', async () => {
    const res = await http.get('/api/v1/intel/analytics/elasticity?productId=domates').expect(200);
    expect(res.body.available).toBe(false);
  });

  it('esneklik: fiyat değişiminden sonra hesaplanır (pricePct doğru)', async () => {
    // domates için bir fiyat değişikliği kaydı üret (3590 → 3990)
    await http.post('/api/v1/intel/price/apply').send({ productId: 'domates', price: 3990, strategy: 'MANUAL' }).expect(200);
    const res = await http.get('/api/v1/intel/analytics/elasticity?productId=domates').expect(200);
    expect(res.body.available).toBe(true);
    expect(res.body.oldPrice).toBe(3590);
    expect(res.body.newPrice).toBe(3990);
    expect(res.body.pricePct).toBeCloseTo(0.1114, 3); // (3990-3590)/3590
  });

  it('productId olmadan → 400', async () => {
    await http.get('/api/v1/intel/analytics/sales').expect(400);
  });
});
