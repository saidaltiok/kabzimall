import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb, authed } from './test-app';

/**
 * Harita konumu zorunluluğu (StoreSetting.requireGeo). Açıkken koordinatsız
 * sipariş reddedilir; koordinatla geçer. Kapalıyken koordinatsız da geçer.
 */
describe('Sipariş için harita konumu zorunluluğu', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const order = (extra: Record<string, unknown> = {}) =>
    request(server).post('/api/v1/storefront/orders').send({
      items: [{ slug: 'geo-domates', qty: 1 }],
      customer: { name: 'Geo Testi', phone: '05559990011', address: 'Geo Mah. Sok. 1', ...extra },
    });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    admin = authed(app);
    server = app.getHttpServer();
    await admin.post('/api/v1/catalog/products').send({ slug: 'geo-domates', name: 'Geo Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 4000, stockQty: 100 }).expect(201);
  });

  afterAll(async () => {
    await admin.put('/api/v1/admin/settings').send({ requireGeo: false }).expect(200); // varsayılana çek
    await app.close();
  });

  it('ayar KAPALIYKEN koordinatsız sipariş geçer', async () => {
    const s = await admin.get('/api/v1/admin/settings').expect(200);
    expect(s.body.requireGeo).toBe(false); // resetDb kapatır
    await order().expect(201);
  });

  it('ayar AÇIKKEN koordinatsız sipariş 400, koordinatla 201', async () => {
    await admin.put('/api/v1/admin/settings').send({ requireGeo: true }).expect(200);
    const red = await order().expect(400);
    expect(red.body.message).toContain('harita');
    await order({ lat: 40.98, lng: 29.03 }).expect(201);
  });
});
