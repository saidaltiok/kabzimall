import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

/** Girdileri (maliyet + hal + rakip) DB'ye kurup tek productId ile öneri. */
describe('Intel /price/*-product (DB girdileriyle öneri)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);

    // GLOBAL maliyet bileşenleri (referans Domates kalemleri)
    await http
      .put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 })
      .expect(200);

    // domates: hal ort. 1870 + 2 rakip (ort 4400)
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'domates', price: 1850, date: '2026-06-29' });
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'domates', price: 1890, date: '2026-06-29' });

    const g = await http.post('/api/v1/intel/competitor-groups').send({ name: 'Orta' });
    const a = await http.post('/api/v1/intel/competitors').send({ name: 'A', groupId: g.body.id });
    const b = await http.post('/api/v1/intel/competitors').send({ name: 'B', groupId: g.body.id });
    await http.post('/api/v1/intel/competitor-prices/entries').send({ productId: 'domates', competitorId: a.body.id, price: 4200, date: '2026-06-29' });
    await http.post('/api/v1/intel/competitor-prices/entries').send({ productId: 'domates', competitorId: b.body.id, price: 4600, date: '2026-06-29' });

    // patates: sadece hal (rakip yok) → fallback testi
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'patates', price: 2000, date: '2026-06-29' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('suggest-product MARGIN → referans 3590, inputs DB\'den toplandı', async () => {
    const res = await http
      .post('/api/v1/intel/price/suggest-product')
      .send({ productId: 'domates', strategy: 'MARGIN', params: { targetMargin: 0.3 }, date: '2026-06-29' })
      .expect(200);

    expect(res.body.price).toBe(3590);
    expect(res.body.inputs.halAvg).toBe(1870);
    expect(res.body.inputs.directCost).toBe(2440);
    expect(res.body.inputs.costSource).toBe('GLOBAL');
    expect(res.body.inputs.competitorCount).toBe(2);
    expect(res.body.inputs.competitorAvg).toBe(4400);
    expect(res.body.competitionIndex).toBe(82); // 3590 / 4400 → ~82
  });

  it('suggest-product COMP_AVG → rakip ortalamasından 4390', async () => {
    const res = await http
      .post('/api/v1/intel/price/suggest-product')
      .send({ productId: 'domates', strategy: 'COMP_AVG', date: '2026-06-29' })
      .expect(200);
    expect(res.body.price).toBe(4390);
  });

  it('resolve-product (rakipsiz patates) → COMP_AVG atlanır, MARGIN fallback', async () => {
    const res = await http
      .post('/api/v1/intel/price/resolve-product')
      .send({ productId: 'patates', date: '2026-06-29' })
      .expect(200);

    expect(res.body.strategy).toBe('MARGIN');
    expect(res.body.usedFallback).toBe(true);
    expect(res.body.inputs.competitorCount).toBe(0);
    expect(res.body.competitionIndex).toBeNull();
  });

  it('halAvg override → hal girişi olmayan ürün için bile çalışır', async () => {
    const res = await http
      .post('/api/v1/intel/price/suggest-product')
      .send({ productId: 'kiraz', strategy: 'MARGIN', halAvg: 5000 })
      .expect(200);
    expect(res.body.inputs.halAvg).toBe(5000);
    expect(res.body.inputs.costSource).toBe('GLOBAL');
  });

  it('maliyet var ama hal yok ve halAvg verilmedi → 400', async () => {
    await http
      .post('/api/v1/intel/price/suggest-product')
      .send({ productId: 'erik', strategy: 'MARGIN' })
      .expect(400);
  });

  it('maliyet bileşeni hiç yoksa → 404', async () => {
    await resetDb(app);
    await http
      .post('/api/v1/intel/price/suggest-product')
      .send({ productId: 'domates', strategy: 'MARGIN', halAvg: 1870 })
      .expect(404);
  });
});
