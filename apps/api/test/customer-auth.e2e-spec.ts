import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb, authed } from './test-app';

/**
 * Müşteri e-posta OTP girişi: kod iste → doğrula → my-orders. Güvenlik sınırı:
 * müşteri token'ı personel uçlarına ASLA kimlik sağlamaz. Rate limit: e-posta
 * başına 10 dk'da 3 kod.
 */
describe('Müşteri OTP girişi + Siparişlerim + güvenlik sınırı', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const EMAIL = 'otp-testi@example.com';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    admin = authed(app);
    server = app.getHttpServer();
    await admin.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 });
    // Bu e-postayla bir sipariş — my-orders bunu listelemeli.
    await request(server).post('/api/v1/storefront/orders').send({
      items: [{ slug: 'domates', qty: 1 }],
      customer: { name: 'OTP Testi', phone: '05550001111', address: 'Adres 1', email: EMAIL },
    }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('kod iste → log modunda devCode döner; yanlış kod → 400; doğru kod → token → my-orders', async () => {
    const req1 = await request(server).post('/api/v1/storefront/auth/request-otp').send({ email: EMAIL }).expect(201);
    expect(req1.body.sent).toBe(true);
    const devCode: string = req1.body.devCode;
    expect(devCode).toMatch(/^\d{6}$/); // SMTP yok → log modu

    await request(server).post('/api/v1/storefront/auth/verify-otp').send({ email: EMAIL, code: '000000' }).expect(400);

    const ver = await request(server).post('/api/v1/storefront/auth/verify-otp').send({ email: EMAIL, code: devCode }).expect(201);
    expect(ver.body.token).toBeTruthy();
    expect(ver.body.email).toBe(EMAIL);

    const mine = await request(server).get('/api/v1/storefront/my-orders')
      .set('Authorization', `Bearer ${ver.body.token}`).expect(200);
    expect(mine.body.email).toBe(EMAIL);
    expect(mine.body.data.length).toBe(1);
    expect(mine.body.data[0].code).toMatch(/^KM/);

    // Kod tek kullanımlık: aynı kodla ikinci doğrulama reddedilir.
    await request(server).post('/api/v1/storefront/auth/verify-otp').send({ email: EMAIL, code: devCode }).expect(400);
  });

  it('my-orders token ister (401); bozuk token → 401', async () => {
    await request(server).get('/api/v1/storefront/my-orders').expect(401);
    await request(server).get('/api/v1/storefront/my-orders').set('Authorization', 'Bearer bozuk').expect(401);
  });

  it('GÜVENLİK: müşteri tokenı personel ucunda 401 (aynı gizle imzalı olsa da)', async () => {
    const r = await request(server).post('/api/v1/storefront/auth/request-otp').send({ email: 'ayrilmis@example.com' }).expect(201);
    const ver = await request(server).post('/api/v1/storefront/auth/verify-otp').send({ email: 'ayrilmis@example.com', code: r.body.devCode }).expect(201);
    await request(server).get('/api/v1/intel/dashboard').set('Authorization', `Bearer ${ver.body.token}`).expect(401);
    await request(server).get('/api/v1/admin/orders').set('Authorization', `Bearer ${ver.body.token}`).expect(401);
  });

  it('rate limit: aynı e-postaya 10 dk içinde 4. kod isteği → 400', async () => {
    const em = 'limit@example.com';
    for (let i = 0; i < 3; i++) {
      await request(server).post('/api/v1/storefront/auth/request-otp').send({ email: em }).expect(201);
    }
    await request(server).post('/api/v1/storefront/auth/request-otp').send({ email: em }).expect(400);
  });
});
