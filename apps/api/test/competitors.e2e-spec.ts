import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Intel rakip uçları (gruplar, rakipler, fiyatlar)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let groupId: string;
  let compA: string;
  let compB: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('grup oluştur + listele', async () => {
    const created = await http
      .post('/api/v1/intel/competitor-groups')
      .send({ name: 'Orta', sortOrder: 1 })
      .expect(201);
    groupId = created.body.id;
    expect(groupId).toBeDefined();

    const list = await http.get('/api/v1/intel/competitor-groups').expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].name).toBe('Orta');
  });

  it('rakip oluştur (grup FK) + listele', async () => {
    const a = await http
      .post('/api/v1/intel/competitors')
      .send({ name: 'Market A', groupId })
      .expect(201);
    const b = await http
      .post('/api/v1/intel/competitors')
      .send({ name: 'Market B', groupId, type: 'zincir' })
      .expect(201);
    compA = a.body.id;
    compB = b.body.id;

    const list = await http.get('/api/v1/intel/competitors').expect(200);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0].group.name).toBe('Orta');
  });

  it('var olmayan grupla rakip → 404', async () => {
    await http
      .post('/api/v1/intel/competitors')
      .send({ name: 'Hayalet', groupId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);
  });

  it('geçersiz groupId (uuid değil) → 400', async () => {
    await http
      .post('/api/v1/intel/competitors')
      .send({ name: 'X', groupId: 'abc' })
      .expect(400);
  });

  it('fiyat girişi + aggregate (min/max/avg/median)', async () => {
    await http
      .post('/api/v1/intel/competitor-prices/entries')
      .send({ productId: 'domates', competitorId: compA, price: 4200, date: '2026-06-29' })
      .expect(201);
    await http
      .post('/api/v1/intel/competitor-prices/entries')
      .send({ productId: 'domates', competitorId: compB, price: 4600, date: '2026-06-29' })
      .expect(201);

    const res = await http
      .get('/api/v1/intel/competitor-prices?productId=domates&date=2026-06-29')
      .expect(200);

    expect(res.body.count).toBe(2);
    expect(res.body.min).toBe(4200);
    expect(res.body.max).toBe(4600);
    expect(res.body.average).toBe(4400); // (4200+4600)/2
    expect(res.body.median).toBe(4400);
    expect(res.body.entries).toHaveLength(2);
  });

  it('aynı rakibin yeni girişi → aggregate en güncel fiyatı kullanır (tek sayar)', async () => {
    await http
      .post('/api/v1/intel/competitor-prices/entries')
      .send({ productId: 'domates', competitorId: compA, price: 3990, date: '2026-06-29' })
      .expect(201);

    const res = await http
      .get('/api/v1/intel/competitor-prices?productId=domates&date=2026-06-29')
      .expect(200);

    expect(res.body.count).toBe(2); // hâlâ 2 rakip
    expect(res.body.min).toBe(3990); // A'nın güncel fiyatı
    expect(res.body.average).toBe(4295); // (3990+4600)/2
  });

  it('productId olmadan fiyat sorgusu → 400', async () => {
    await http.get('/api/v1/intel/competitor-prices').expect(400);
  });

  it('rakip fiyatı olmayan ürün → boş aggregate (null)', async () => {
    const res = await http
      .get('/api/v1/intel/competitor-prices?productId=yok&date=2026-06-29')
      .expect(200);
    expect(res.body.count).toBe(0);
    expect(res.body.average).toBeNull();
  });
});
