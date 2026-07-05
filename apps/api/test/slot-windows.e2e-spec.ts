import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

const uniqueWindows = (slots: { window: string }[]) => [...new Set(slots.map((s) => s.window))];

describe('Teslimat saat pencereleri (Ayarlar → storefront slots)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ayar yokken varsayılan 3 pencere döner', async () => {
    const res = await request(server).get('/api/v1/storefront/slots').expect(200);
    expect(uniqueWindows(res.body.data)).toEqual(['10:00-13:00', '13:00-16:00', '16:00-19:00']);
  });

  it('ayarlardan pencere değişince storefront slots aynısını döner', async () => {
    const windows = ['08:00-11:00', '11:00-14:00', '14:00-17:00', '17:00-20:00'];
    await http.put('/api/v1/admin/settings').send({ deliveryWindows: windows }).expect(200);
    const res = await request(server).get('/api/v1/storefront/slots').expect(200);
    expect(uniqueWindows(res.body.data)).toEqual(windows);
  });

  it('bozuk biçim reddedilir (SS:DD-SS:DD dışı)', async () => {
    await http.put('/api/v1/admin/settings').send({ deliveryWindows: ['sabah'] }).expect(400);
    await http.put('/api/v1/admin/settings').send({ deliveryWindows: ['8:00-10:00'] }).expect(400); // tek haneli saat
  });

  it('yeni pencereyle sipariş verilebilir, eski pencere reddedilir', async () => {
    await http.post('/api/v1/catalog/products').send({ slug: 'slt-urun', name: 'Slot Ürünü', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 2000 }).expect(201);
    const slots = await request(server).get('/api/v1/storefront/slots').expect(200);
    const first = slots.body.data[0];
    const customer = { name: 'Slot Testi', phone: '05551110088', address: 'Test Sok. 2' };

    const ok = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'slt-urun', qty: 2 }], customer, slot: { date: first.date, window: first.window } })
      .expect(201);
    expect(ok.body.deliveryWindow).toBe(first.window);

    // ayarlarda artık olmayan pencere → kapasite listesinde yok → 400
    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'slt-urun', qty: 2 }], customer, slot: { date: first.date, window: '10:00-13:00' } })
      .expect(400);
  });
});
