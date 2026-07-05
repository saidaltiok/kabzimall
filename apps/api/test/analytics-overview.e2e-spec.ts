import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Intel /analytics — mağaza geneli + fiyat hareketliliği', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let expectedRevenue = 0;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    await http.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 }).expect(201);
    await http.post('/api/v1/catalog/products').send({ slug: 'salatalik', name: 'Salatalık', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 2000 }).expect(201);

    const cust = { name: 'Genel', phone: '05551110077', address: 'Adres 3' };
    const o1 = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 2 }], customer: cust }).expect(201);
    const o2 = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'salatalik', qty: 1 }], customer: cust }).expect(201);
    expectedRevenue = o1.body.grandTotal + o2.body.grandTotal;

    // iptal edilen sipariş ciroya girmemeli
    const iptal = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 5 }], customer: cust }).expect(201);
    await http.patch(`/api/v1/admin/orders/${iptal.body.id}/status`).send({ status: 'CANCELLED' }).expect(200);

    // fiyat hareketleri: domates 2 kez, salatalık 0 kez
    await http.post('/api/v1/intel/price/apply').send({ productId: 'domates', price: 3990, strategy: 'MANUAL' }).expect(200);
    await http.post('/api/v1/intel/price/apply').send({ productId: 'domates', price: 3790, strategy: 'MANUAL' }).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('overview: bugünün cirosu/siparişi doğru, iptal hariç, boş günler 0 dolgulu', async () => {
    const res = await http.get('/api/v1/intel/analytics/overview?days=7').expect(200);
    expect(res.body.series).toHaveLength(7);
    const today = res.body.series[6];
    expect(today.orders).toBe(2);
    expect(today.revenue).toBe(expectedRevenue); // iptal edilen 3. sipariş dahil değil
    expect(res.body.summary.totalOrders).toBe(2);
    expect(res.body.summary.totalRevenue).toBe(expectedRevenue);
    expect(res.body.series.slice(0, 6).every((p: { orders: number }) => p.orders === 0)).toBe(true);
  });

  it('overview: ort. sepet = ciro / sipariş', async () => {
    const res = await http.get('/api/v1/intel/analytics/overview?days=7').expect(200);
    expect(res.body.summary.avgOrderValue).toBe(Math.round(res.body.summary.totalRevenue / res.body.summary.totalOrders));
  });

  it('price-movers: değişen ürün sayısı ve değişim adedi doğru', async () => {
    const res = await http.get('/api/v1/intel/analytics/price-movers?days=30').expect(200);
    expect(res.body.summary.changedProducts).toBe(1);
    expect(res.body.summary.unchangedProducts).toBe(1);
    expect(res.body.summary.totalChanges).toBe(2);

    const m = res.body.movers[0];
    expect(m.slug).toBe('domates');
    expect(m.changes).toBe(2);
    expect(m.firstPrice).toBe(3590);
    expect(m.lastPrice).toBe(3790);
    expect(m.netPct).toBeCloseTo((3790 - 3590) / 3590, 3);
    // ısı haritası: bugünkü hücrede 2 değişiklik
    const today = new Date().toISOString().slice(0, 10);
    expect(m.byDay[today]).toBe(2);
  });

  it('token olmadan kapalı', async () => {
    await request(server).get('/api/v1/intel/analytics/overview').expect(401);
    await request(server).get('/api/v1/intel/analytics/price-movers').expect(401);
  });
});
