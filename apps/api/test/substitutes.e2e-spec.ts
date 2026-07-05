import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('İkame ürünler', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let ikmAnaId = '';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    const ikmAna = await http.post('/api/v1/catalog/products').send({ slug: 'ikm-ana', name: 'İkame Ana', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6400, stockQty: 0 }).expect(201);
    ikmAnaId = ikmAna.body.id;
    await http.post('/api/v1/catalog/products').send({ slug: 'ikm-b', name: 'İkame B', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 9000, stockQty: 5 }).expect(201);
    await http.post('/api/v1/catalog/products').send({ slug: 'ikm-c', name: 'İkame C', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 7000, stockQty: 0 }).expect(201); // stoksuz ikame
    await http.post('/api/v1/catalog/products').send({ slug: 'ikm-fiyatsiz', name: 'İkame Fiyatsız', saleType: 'WEIGHT', unitLabel: 'kg' }).expect(201); // fiyatsız ikame
  });

  afterAll(async () => {
    await app.close();
  });

  it('ikame atanır ve sıra korunur', async () => {
    const res = await http.put(`/api/v1/catalog/products/${ikmAnaId}/substitutes`).send({ slugs: ['ikm-b', 'ikm-c', 'ikm-fiyatsiz'] }).expect(200);
    expect(res.body.data.map((s: { slug: string }) => s.slug)).toEqual(['ikm-b', 'ikm-c', 'ikm-fiyatsiz']);
  });

  it('kendisi ve bilinmeyen slug reddedilir', async () => {
    await http.put(`/api/v1/catalog/products/${ikmAnaId}/substitutes`).send({ slugs: ['ikm-ana'] }).expect(400);
    await http.put(`/api/v1/catalog/products/${ikmAnaId}/substitutes`).send({ slugs: ['yok-boyle-urun'] }).expect(400);
  });

  it('vitrin ürün detayı yalnız satılabilir ikameleri döner (stoksuz/fiyatsız elenir)', async () => {
    const res = await request(server).get('/api/v1/storefront/products/ikm-ana').expect(200);
    expect(res.body.substitutes.map((s: { slug: string }) => s.slug)).toEqual(['ikm-b']);
  });

  it('sipariş listesinde paketleyici ikame önerisini görür', async () => {
    // ana ürüne stok verip sipariş at — sipariş listesi item.product.substitutes taşımalı.
    await http.patch(`/api/v1/catalog/products/${ikmAnaId}`).send({ stockQty: 2 }).expect(200);
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'ikm-ana', qty: 1 }], customer: { name: 'İkame Testi', phone: '05551110033', address: 'C Mah.' } }).expect(201);
    const list = await http.get('/api/v1/admin/orders').expect(200);
    const order = list.body.data.find((o: { customerName: string }) => o.customerName === 'İkame Testi');
    const item = order.items[0];
    expect(item.product.substitutes.map((s: { substitute: { name: string } }) => s.substitute.name)).toEqual(['İkame B', 'İkame C', 'İkame Fiyatsız']);
  });

  it('ikame listesi boş diziyle temizlenir', async () => {
    const res = await http.put(`/api/v1/catalog/products/${ikmAnaId}/substitutes`).send({ slugs: [] }).expect(200);
    expect(res.body.data).toEqual([]);
  });
});
