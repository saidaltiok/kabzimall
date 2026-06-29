import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Intel /hal-purchases uçları', () => {
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

  it('POST → ±500 g mutabakatı: 50 kg yerine 49.6 kg gelince efektif maliyet artar', async () => {
    // 100000 kuruş / 50 kg = 2000/kg kayıtlı; gerçek 49.6 kg → 2016/kg.
    const res = await http
      .post('/api/v1/intel/hal-purchases')
      .send({ productId: 'domates', recordedKg: 50, actualKg: 49.6, totalPaid: 100000 })
      .expect(201);

    expect(res.body.reconciliation.recordedUnitCost).toBe(2000);
    expect(res.body.reconciliation.actualUnitCost).toBe(2016);
    expect(res.body.reconciliation.deltaKg).toBeCloseTo(-0.4, 3);
    expect(res.body.weightRiskPct).toBeCloseTo(0.01, 5); // 0.5/50
    expect(res.body.id).toBeDefined();
  });

  it('actualKg yoksa mutabakat alanları null, kayıt yine de oluşur', async () => {
    const res = await http
      .post('/api/v1/intel/hal-purchases')
      .send({ recordedKg: 10, totalPaid: 50000 })
      .expect(201);

    expect(res.body.reconciliation.recordedUnitCost).toBe(5000);
    expect(res.body.reconciliation.actualUnitCost).toBeNull();
    expect(res.body.productId).toBeNull();
  });

  it('GET ?productId= ile filtreler', async () => {
    const res = await http
      .get('/api/v1/intel/hal-purchases?productId=domates')
      .expect(200);

    expect(res.body.data.every((r: { productId: string }) => r.productId === 'domates')).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /:id bilinmeyen → 404', async () => {
    await http.get('/api/v1/intel/hal-purchases/yok-boyle-id').expect(404);
  });

  it('geçersiz recordedKg (0) → 400', async () => {
    await http
      .post('/api/v1/intel/hal-purchases')
      .send({ recordedKg: 0, totalPaid: 1000 })
      .expect(400);
  });
});
