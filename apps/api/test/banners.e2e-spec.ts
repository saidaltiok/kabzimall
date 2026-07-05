import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Banner (admin CRUD + vitrin)', () => {
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

  it('banner yokken vitrin boş liste döner (site varsayılana düşer)', async () => {
    const res = await request(server).get('/api/v1/storefront/banners').expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('başlıksız banner reddedilir', async () => {
    await http.post('/api/v1/admin/banners').send({ title: '   ' }).expect(400);
  });

  it('olmayan kupon koduna bağlanan banner reddedilir', async () => {
    await http.post('/api/v1/admin/banners').send({ title: 'Kampanya', couponCode: 'YOKBOYLEKOD' }).expect(400);
  });

  it('kupon kodlu banner: kod normalize edilip doğrulanır', async () => {
    await http.post('/api/v1/admin/coupons').send({ code: 'BANNER10', type: 'PERCENT', value: 10 }).expect(201);
    const res = await http.post('/api/v1/admin/banners').send({ title: 'İlk siparişe %10', kicker: 'Kampanya', couponCode: 'banner10' }).expect(201);
    expect(res.body.couponCode).toBe('BANNER10');
    expect(res.body.isActive).toBe(true);
  });

  it('vitrin: yalnız aktifler, sortOrder sırasıyla', async () => {
    await http.post('/api/v1/admin/banners').send({ title: 'Öne alınan', sortOrder: -1 }).expect(201);
    const gizli = await http.post('/api/v1/admin/banners').send({ title: 'Gizlenecek', sortOrder: -5 }).expect(201);
    await http.patch(`/api/v1/admin/banners/${gizli.body.id}/active`).send({ isActive: false }).expect(200);

    const res = await request(server).get('/api/v1/storefront/banners').expect(200);
    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(['Öne alınan', 'İlk siparişe %10']);
    // vitrin yanıtı yönetim alanlarını sızdırmaz
    expect(res.body.data[0].isActive).toBeUndefined();
    expect(res.body.data[0].sortOrder).toBeUndefined();
  });

  it('silinen banner vitrinden düşer', async () => {
    const list = await http.get('/api/v1/admin/banners').expect(200);
    const one = list.body.data.find((b: { title: string }) => b.title === 'Öne alınan');
    await http.delete(`/api/v1/admin/banners/${one.id}`).expect(200);
    const res = await request(server).get('/api/v1/storefront/banners').expect(200);
    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(['İlk siparişe %10']);
  });

  it('token olmadan admin uçları kapalı', async () => {
    await request(server).get('/api/v1/admin/banners').expect(401);
    await request(server).post('/api/v1/admin/banners').send({ title: 'X' }).expect(401);
  });
});
