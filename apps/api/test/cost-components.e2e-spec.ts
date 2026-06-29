import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb, DOMATES_COST } from './test-app';

describe('Intel maliyet bileşenleri + /cost/:productId', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT GLOBAL bileşen → oluşturur', async () => {
    const res = await http
      .put('/api/v1/intel/cost-components')
      .send({
        scope: 'GLOBAL',
        fireRate: 0.15,
        labor: 120,
        packaging: 70,
        fuel: 50,
        commissionRate: 0.03,
      })
      .expect(200);
    expect(res.body.scope).toBe('GLOBAL');
    expect(res.body.refId).toBe('');
  });

  it('PUT aynı GLOBAL tekrar → günceller (upsert, tek satır)', async () => {
    await http
      .put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 150, packaging: 70, fuel: 50, commissionRate: 0.03 })
      .expect(200);

    const list = await http.get('/api/v1/intel/cost-components').expect(200);
    expect(list.body.meta.total).toBe(1); // hâlâ tek GLOBAL
    expect(list.body.data[0].labor).toBe(150);
  });

  it('PRODUCT için refId zorunlu → 400', async () => {
    await http
      .put('/api/v1/intel/cost-components')
      .send({ scope: 'PRODUCT', fireRate: 0.2 })
      .expect(400);
  });

  it('GET /cost/:productId — halAvg override ile referans directCost 2440', async () => {
    // GLOBAL labor şu an 150; referans için bu üründe PRODUCT override koyalım.
    await http
      .put('/api/v1/intel/cost-components')
      .send({
        scope: 'PRODUCT',
        refId: 'domates',
        fireRate: 0.15,
        labor: 120,
        packaging: 70,
        fuel: 50,
        commissionRate: 0.03,
      })
      .expect(200);

    const res = await http
      .get(`/api/v1/intel/cost/domates?halAvg=${DOMATES_COST.halAvg}`)
      .expect(200);

    expect(res.body.source).toBe('PRODUCT');
    expect(res.body.halAvg).toBe(1870);
    expect(res.body.directCost).toBe(2440); // fireCost 2200 + 120 + 70 + 50
  });

  it('GET /cost/:productId — halAvg verilmeyince en güncel hal ortalamasını kullanır', async () => {
    await http
      .post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 1800, date: '2026-06-29' })
      .expect(201);
    await http
      .post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 1940, date: '2026-06-29' })
      .expect(201);

    const res = await http.get('/api/v1/intel/cost/domates').expect(200);
    expect(res.body.halAvg).toBe(1870); // (1800+1940)/2
    expect(res.body.directCost).toBe(2440);
  });

  it('GET /cost/:productId — sadece GLOBAL varsa source GLOBAL', async () => {
    const res = await http
      .get('/api/v1/intel/cost/biber?halAvg=2000')
      .expect(200);
    expect(res.body.source).toBe('GLOBAL');
    expect(res.body.halAvg).toBe(2000);
  });

  it('hiç bileşen tanımlı olmayan tenant senaryosu → 404', async () => {
    await resetDb(app); // tüm bileşenleri sil
    await http.get('/api/v1/intel/cost/domates?halAvg=2000').expect(404);
  });
});
