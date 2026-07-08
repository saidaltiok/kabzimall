import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb, authed } from './test-app';

/**
 * "Adreslerim" (kayıtlı teslimat adresleri) + harita konumu zorunluluğu.
 * Kimlik e-posta OTP ile; her müşteri yalnız kendi adreslerini yönetir;
 * lat/lng zorunlu; varsayılan adres tekil.
 */
describe('Adreslerim + geo zorunluluğu', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const EMAIL = 'adres-testi@example.com';
  const OTHER = 'baskasi@example.com';

  const tokenFor = async (email: string) => {
    const r = await request(server).post('/api/v1/storefront/auth/request-otp').send({ email }).expect(201);
    const v = await request(server).post('/api/v1/storefront/auth/verify-otp').send({ email, code: r.body.devCode }).expect(201);
    return v.body.token as string;
  };
  const addr = (over: Record<string, unknown> = {}) => ({
    label: 'Ev', name: 'Ayşe Yılmaz', phone: '0555 555 55 55',
    addressText: 'Moda Cad. 41 D:3', district: 'Kadıköy', lat: 40.987, lng: 29.026, ...over,
  });

  let token = '';
  let otherToken = '';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    admin = authed(app);
    server = app.getHttpServer();
    token = await tokenFor(EMAIL);
    otherToken = await tokenFor(OTHER);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (t = token) => request(server).get('/api/v1/storefront/addresses').set('Authorization', `Bearer ${t}`);
  const post = (body: object, t = token) => request(server).post('/api/v1/storefront/addresses').set('Authorization', `Bearer ${t}`).send(body);

  it('giriş gerektirir (401)', async () => {
    await request(server).get('/api/v1/storefront/addresses').expect(401);
    await request(server).post('/api/v1/storefront/addresses').send(addr()).expect(401);
  });

  let id1 = '';
  it('ilk adres kendiliğinden varsayılan; liste sahibine döner', async () => {
    const r = await post(addr()).expect(201);
    id1 = r.body.id;
    expect(r.body.isDefault).toBe(true);
    expect(r.body.district).toBe('Kadıköy');
    const list = await get().expect(200);
    expect(list.body.data.length).toBe(1);
  });

  it('lat/lng ZORUNLU — koordinatsız adres 400', async () => {
    await post({ label: 'İş', name: 'Ayşe Yılmaz', phone: '0555 555 55 55', addressText: 'Bir yer 1' }).expect(400);
  });

  it('geçersiz ad/telefon reddedilir', async () => {
    await post(addr({ name: '123' })).expect(400);
    await post(addr({ phone: '123' })).expect(400);
  });

  let id2 = '';
  it('ikinci adres varsayılan işaretlenince eskisi düşer (tekil varsayılan)', async () => {
    const r = await post(addr({ label: 'İş', isDefault: true })).expect(201);
    id2 = r.body.id;
    const list = await get().expect(200);
    const defs = list.body.data.filter((a: { isDefault: boolean }) => a.isDefault);
    expect(defs.length).toBe(1);
    expect(defs[0].id).toBe(id2);
    // Varsayılan en üstte sıralanır.
    expect(list.body.data[0].id).toBe(id2);
  });

  it('güncelleme: etiket + konum değişir', async () => {
    const r = await request(server).patch(`/api/v1/storefront/addresses/${id1}`).set('Authorization', `Bearer ${token}`)
      .send({ label: 'Annem', lat: 41.0, lng: 29.1 }).expect(200);
    expect(r.body.label).toBe('Annem');
    expect(r.body.lat).toBeCloseTo(41.0);
  });

  it('SAHİPLİK: başka müşteri bu adresi göremez/güncelleyemez/silemez (404)', async () => {
    expect((await get(otherToken).expect(200)).body.data.length).toBe(0);
    await request(server).patch(`/api/v1/storefront/addresses/${id1}`).set('Authorization', `Bearer ${otherToken}`).send({ label: 'X' }).expect(404);
    await request(server).delete(`/api/v1/storefront/addresses/${id1}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
  });

  it('silme: varsayılan silinince başka adres varsayılana yükselir', async () => {
    await request(server).delete(`/api/v1/storefront/addresses/${id2}`).set('Authorization', `Bearer ${token}`).expect(200);
    const list = await get().expect(200);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].isDefault).toBe(true); // kalan adres varsayılan oldu
    expect(list.body.data[0].id).toBe(id1);
  });
});
