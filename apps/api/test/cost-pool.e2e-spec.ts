import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb, DOMATES_COST } from './test-app';

describe('Intel /cost-pool uçları', () => {
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

  it('POST → havuz maliyetini kg başına tahsis eder (işçilik 5.000.000/10.000 = 500/kg)', async () => {
    const res = await http
      .post('/api/v1/intel/cost-pool')
      .send({ period: '2026-06', totalLabor: 5000000, totalFuel: 2000000, totalVolumeKg: 10000 })
      .expect(201);

    expect(res.body.allocation.laborPerKg).toBe(500);
    expect(res.body.allocation.fuelPerKg).toBe(200);
    expect(res.body.allocation.distributedPerKg).toBe(700);
    expect(res.body.preview).toBeNull();
  });

  it('previewProduct ile directCost önizlemesi packages/pricing üzerinden döner', async () => {
    const res = await http
      .post('/api/v1/intel/cost-pool')
      .send({
        period: '2026-06',
        totalLabor: 5000000,
        totalFuel: 2000000,
        totalVolumeKg: 10000,
        previewProduct: {
          halAvg: DOMATES_COST.halAvg,
          fireRate: DOMATES_COST.fireRate,
          packaging: DOMATES_COST.packaging,
          commissionRate: DOMATES_COST.commissionRate,
        },
      })
      .expect(201);

    // fireCost = 1870/0.85 = 2200; + labor 500 + packaging 70 + fuel 200 = 2970
    expect(res.body.preview.directCost).toBe(2970);
    expect(res.body.preview.breakdown.labor).toBe(500);
    expect(res.body.preview.breakdown.fuel).toBe(200);
  });

  it('GET ?period= ile filtreler', async () => {
    const res = await http.get('/api/v1/intel/cost-pool?period=2026-06').expect(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('totalVolumeKg = 0 → 400', async () => {
    await http
      .post('/api/v1/intel/cost-pool')
      .send({ period: '2026-06', totalLabor: 1000, totalFuel: 1000, totalVolumeKg: 0 })
      .expect(400);
  });
});
