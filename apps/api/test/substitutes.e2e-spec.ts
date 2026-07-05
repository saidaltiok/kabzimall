import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('İkame ürünler', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let cilekId = '';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    const cilek = await http.post('/api/v1/catalog/products').send({ slug: 'cilek', name: 'Çilek', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6400, stockQty: 0 }).expect(201);
    cilekId = cilek.body.id;
    await http.post('/api/v1/catalog/products').send({ slug: 'ahududu', name: 'Ahududu', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 9000, stockQty: 5 }).expect(201);
    await http.post('/api/v1/catalog/products').send({ slug: 'dut', name: 'Dut', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 7000, stockQty: 0 }).expect(201); // stoksuz ikame
    await http.post('/api/v1/catalog/products').send({ slug: 'fiyatsiz', name: 'Fiyatsız', saleType: 'WEIGHT', unitLabel: 'kg' }).expect(201); // fiyatsız ikame
  });

  afterAll(async () => {
    await app.close();
  });

  it('ikame atanır ve sıra korunur', async () => {
    const res = await http.put(`/api/v1/catalog/products/${cilekId}/substitutes`).send({ slugs: ['ahududu', 'dut', 'fiyatsiz'] }).expect(200);
    expect(res.body.data.map((s: { slug: string }) => s.slug)).toEqual(['ahududu', 'dut', 'fiyatsiz']);
  });

  it('kendisi ve bilinmeyen slug reddedilir', async () => {
    await http.put(`/api/v1/catalog/products/${cilekId}/substitutes`).send({ slugs: ['cilek'] }).expect(400);
    await http.put(`/api/v1/catalog/products/${cilekId}/substitutes`).send({ slugs: ['yok-boyle-urun'] }).expect(400);
  });

  it('vitrin ürün detayı yalnız satılabilir ikameleri döner (stoksuz/fiyatsız elenir)', async () => {
    const res = await request(server).get('/api/v1/storefront/products/cilek').expect(200);
    expect(res.body.substitutes.map((s: { slug: string }) => s.slug)).toEqual(['ahududu']);
  });

  it('sipariş listesinde paketleyici ikame önerisini görür', async () => {
    // ahududu siparişi ver (stoklu) — item.product.substitutes çilek için değil ama listede product bilgisi dönsün diye çilekli sipariş veremeyiz (stok 0).
    await http.patch(`/api/v1/catalog/products/${cilekId}`).send({ stockQty: 2 }).expect(200);
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'cilek', qty: 1 }], customer: { name: 'İkame Testi', phone: '05551110033', address: 'C Mah.' } }).expect(201);
    const list = await http.get('/api/v1/admin/orders').expect(200);
    const order = list.body.data.find((o: { customerName: string }) => o.customerName === 'İkame Testi');
    const item = order.items[0];
    expect(item.product.substitutes.map((s: { substitute: { name: string } }) => s.substitute.name)).toEqual(['Ahududu', 'Dut', 'Fiyatsız']);
  });

  it('ikame listesi boş diziyle temizlenir', async () => {
    const res = await http.put(`/api/v1/catalog/products/${cilekId}/substitutes`).send({ slugs: [] }).expect(200);
    expect(res.body.data).toEqual([]);
  });
});
