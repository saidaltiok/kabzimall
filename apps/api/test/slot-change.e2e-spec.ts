import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb, authed } from './test-app';

/**
 * Teslimat saati değişikliği onay akışı: müşteri talep eder (yalnız CONFIRMED),
 * admin onaylar/reddeder, müşteri bilgilendirilir. + Eksik ürün tercihi ve
 * e-posta bildirim kaydı (EMAIL kanalı, log modu).
 */
describe('Teslimat saati değişikliği + eksik ürün tercihi + e-posta kaydı', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let slots: { date: string; window: string }[];

  const makeOrder = async (extra: Record<string, unknown> = {}) => {
    const { customer: extraCustomer, ...rest } = extra;
    const res = await request(server)
      .post('/api/v1/storefront/orders')
      .send({
        items: [{ slug: 'domates', qty: 1 }],
        slot: slots[0],
        ...rest,
        customer: { name: 'Test Müşteri', phone: '05550000001', address: 'Test Mah. 1', ...((extraCustomer as object) ?? {}) },
      })
      .expect(201);
    return res.body as { id: string; substitutionPref: string; customerEmail: string | null };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    admin = authed(app);
    server = app.getHttpServer();
    await admin.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 });
    const s = await request(server).get('/api/v1/storefront/slots').expect(200);
    // ValidationPipe fazla alanı reddeder → yalnız {date, window} gönder.
    slots = (s.body.data as { date: string; window: string }[]).map(({ date, window }) => ({ date, window }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('eksik ürün tercihi: kaydedilir; geçersiz → 400; varsayılan CALL', async () => {
    const o1 = await makeOrder({ substitutionPref: 'SUBSTITUTE' });
    expect(o1.substitutionPref).toBe('SUBSTITUTE');

    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'domates', qty: 1 }], customer: { name: 'X Y', phone: '05550000002', address: 'Adres 2' }, substitutionPref: 'GEÇERSİZ' })
      .expect(400);

    const o2 = await makeOrder();
    expect(o2.substitutionPref).toBe('CALL');
  });

  it('e-posta verilirse sipariş alındı e-postası EMAIL kanalıyla kaydedilir (log modu)', async () => {
    const o = await makeOrder({ customer: { email: 'e2e@example.com' } });
    expect(o.customerEmail).toBe('e2e@example.com');
    const detail = await request(server).get(`/api/v1/storefront/orders/${o.id}`).expect(200);
    const channels = detail.body.notifications.map((n: { channel: string }) => n.channel);
    expect(channels).toContain('EMAIL');
  });

  it('saat talebi: CONFIRMED → PENDING; aynı slot → 400; geçersiz slot → 400', async () => {
    const o = await makeOrder();
    // aynı slot reddedilir
    await request(server).post(`/api/v1/storefront/orders/${o.id}/slot-change`).send(slots[0]).expect(400);
    // sunulmayan slot reddedilir
    await request(server).post(`/api/v1/storefront/orders/${o.id}/slot-change`).send({ date: '2030-01-01', window: '10:00-13:00' }).expect(400);
    // geçerli farklı slot → PENDING
    const r = await request(server).post(`/api/v1/storefront/orders/${o.id}/slot-change`).send(slots[1]).expect(201);
    expect(r.body.slotChangeStatus).toBe('PENDING');
    expect(r.body.slotChangeWindow).toBe(slots[1].window);
  });

  it('onay: slot gerçekten değişir, talep temizlenir, müşteri bildirimi düşer', async () => {
    const o = await makeOrder();
    await request(server).post(`/api/v1/storefront/orders/${o.id}/slot-change`).send(slots[1]).expect(201);
    const r = await admin.post(`/api/v1/admin/orders/${o.id}/slot-change`).send({ approve: true }).expect(201);
    expect(r.body.deliveryWindow).toBe(slots[1].window);
    expect(r.body.slotChangeStatus).toBeNull();
    const msgs = r.body.notifications.map((n: { message: string }) => n.message).join(' | ');
    expect(msgs).toContain('Teslimat saatiniz güncellendi');
    // ikinci karar → bekleyen talep yok → 400
    await admin.post(`/api/v1/admin/orders/${o.id}/slot-change`).send({ approve: true }).expect(400);
  });

  it('red: slot DEĞİŞMEZ, talep temizlenir, müşteri bilgilendirilir', async () => {
    const o = await makeOrder();
    await request(server).post(`/api/v1/storefront/orders/${o.id}/slot-change`).send(slots[1]).expect(201);
    const r = await admin.post(`/api/v1/admin/orders/${o.id}/slot-change`).send({ approve: false }).expect(201);
    expect(r.body.deliveryWindow).toBe(slots[0].window); // mevcut korunur
    expect(r.body.slotChangeStatus).toBeNull();
    const msgs = r.body.notifications.map((n: { message: string }) => n.message).join(' | ');
    expect(msgs).toContain('onaylanamadı');
  });

  it('hazırlanmaya başlayan siparişte talep → 400', async () => {
    const o = await makeOrder();
    await admin.patch(`/api/v1/admin/orders/${o.id}/status`).send({ status: 'PREPARING' }).expect(200);
    await request(server).post(`/api/v1/storefront/orders/${o.id}/slot-change`).send(slots[1]).expect(400);
  });
});
