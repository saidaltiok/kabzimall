import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Stok hareket defteri', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let productId = '';

  const CUSTOMER = { name: 'Stok Testi', phone: '05551110066', address: 'Test Cad. 5' };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    const p = await http.post('/api/v1/catalog/products').send({ slug: 'elma', name: 'Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 4000, stockQty: 20 }).expect(201);
    productId = p.body.id;
    // stok takipsiz ürün — hareket üretmemeli
    await http.post('/api/v1/catalog/products').send({ slug: 'muz', name: 'Muz', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6000 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sipariş stok düşer ve ORDER hareketi bırakır (sipariş koduyla)', async () => {
    const o = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'elma', qty: 3 }, { slug: 'muz', qty: 1 }], customer: CUSTOMER }).expect(201);
    const res = await http.get('/api/v1/catalog/products/stock-movements?product=elma').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ delta: -3, reason: 'ORDER', refCode: o.body.code });
    expect(res.body.data[0].product.stockQty).toBe(17);
    // takipsiz ürün hareket üretmez
    const muz = await http.get('/api/v1/catalog/products/stock-movements?product=muz').expect(200);
    expect(muz.body.data).toHaveLength(0);
  });

  it('iptal stoğu geri yükler ve CANCEL hareketi bırakır', async () => {
    const o = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'elma', qty: 2 }], customer: CUSTOMER }).expect(201);
    await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'CANCELLED' }).expect(200);
    const res = await http.get('/api/v1/catalog/products/stock-movements?product=elma').expect(200);
    expect(res.body.data[0]).toMatchObject({ delta: 2, reason: 'CANCEL', refCode: o.body.code });
    expect(res.body.data[0].product.stockQty).toBe(17); // 20 − 3 − 2 + 2
  });

  it('katalogdan elle stok değişimi MANUAL hareket bırakır (aktörlü)', async () => {
    await http.patch(`/api/v1/catalog/products/${productId}`).send({ stockQty: 25 }).expect(200);
    const res = await http.get('/api/v1/catalog/products/stock-movements?product=elma').expect(200);
    expect(res.body.data[0]).toMatchObject({ delta: 8, reason: 'MANUAL' }); // 17 → 25
    expect(res.body.data[0].actor).toContain('@');
  });

  it('stok aynı değere yazılırsa hareket oluşmaz', async () => {
    const before = (await http.get('/api/v1/catalog/products/stock-movements?product=elma').expect(200)).body.data.length;
    await http.patch(`/api/v1/catalog/products/${productId}`).send({ stockQty: 25 }).expect(200);
    const after = (await http.get('/api/v1/catalog/products/stock-movements?product=elma').expect(200)).body.data.length;
    expect(after).toBe(before);
  });

  it('filtresiz liste tüm ürünleri kapsar, token olmadan kapalı', async () => {
    const res = await http.get('/api/v1/catalog/products/stock-movements').expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    await request(server).get('/api/v1/catalog/products/stock-movements').expect(401);
  });
});
