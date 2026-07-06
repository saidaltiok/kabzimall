import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Fiyat matrisi (birleşik tablo + toplu yayın)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    // GLOBAL maliyet + hal → taban/öneri hesaplanabilir
    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 }).expect(200);
    await http.post('/api/v1/catalog/products').send({ slug: 'mtx-domates', name: 'Matris Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 8000 }).expect(201);
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'mtx-domates', price: 4000, date: TODAY }).expect(201);

    // iki grup + rakip + bugünkü fiyat
    const g1 = (await http.post('/api/v1/intel/competitor-groups').send({ name: 'Zincir', sortOrder: 1 }).expect(201)).body.id;
    const g2 = (await http.post('/api/v1/intel/competitor-groups').send({ name: 'Manav', sortOrder: 2 }).expect(201)).body.id;
    const c1 = (await http.post('/api/v1/intel/competitors').send({ name: 'A Market', groupId: g1 }).expect(201)).body.id;
    const c2 = (await http.post('/api/v1/intel/competitors').send({ name: 'B Manav', groupId: g2 }).expect(201)).body.id;
    await http.post('/api/v1/intel/competitor-prices/entries').send({ productId: 'mtx-domates', competitorId: c1, price: 7000, date: TODAY }).expect(201);
    await http.post('/api/v1/intel/competitor-prices/entries').send({ productId: 'mtx-domates', competitorId: c2, price: 9000, date: TODAY }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('matris: gruplar sütun, satırda hal/rakip/ort/medyan/öneri/taban dolu', async () => {
    const res = await http.get('/api/v1/intel/pricing-matrix').expect(200);
    expect(res.body.groups).toEqual(expect.arrayContaining(['Zincir', 'Manav']));
    const row = res.body.rows.find((r: { slug: string }) => r.slug === 'mtx-domates');
    expect(row).toBeTruthy();
    expect(row.halAvg).toBe(4000);
    expect(row.byGroup.Zincir).toBe(7000);
    expect(row.byGroup.Manav).toBe(9000);
    expect(row.avg).toBe(8000);   // (7000+9000)/2
    expect(row.median).toBe(8000);
    expect(row.premiumAvg).toBe(9000); // medyan üstü tek fiyat: 9000
    expect(row.floorPrice).toBeGreaterThan(0);
    expect(row.suggested).toBeGreaterThan(0);
    expect(row.currentPrice).toBe(8000);
    expect(row.published).toBe(true);
  });

  it('toplu yayın: taban altı engellenir, geçerli fiyat yayınlanır + aktive eder', async () => {
    const before = await http.get('/api/v1/intel/pricing-matrix').expect(200);
    const floor = before.body.rows.find((r: { slug: string }) => r.slug === 'mtx-domates').floorPrice;

    // taban altı → blocked
    const blk = await http.post('/api/v1/intel/pricing-matrix/publish').send({ items: [{ slug: 'mtx-domates', price: Math.max(1, floor - 500) }] }).expect(201);
    expect(blk.body.blocked).toHaveLength(1);
    expect(blk.body.published).toHaveLength(0);

    // taban üstü → published
    const ok = await http.post('/api/v1/intel/pricing-matrix/publish').send({ items: [{ slug: 'mtx-domates', price: floor + 1000 }] }).expect(201);
    expect(ok.body.published).toEqual(['mtx-domates']);

    const after = await http.get('/api/v1/intel/pricing-matrix').expect(200);
    expect(after.body.rows.find((r: { slug: string }) => r.slug === 'mtx-domates').currentPrice).toBe(floor + 1000);
  });

  it('taban altı: allowBelowFloor ile zorlanır', async () => {
    const m = await http.get('/api/v1/intel/pricing-matrix').expect(200);
    const floor = m.body.rows.find((r: { slug: string }) => r.slug === 'mtx-domates').floorPrice;
    const res = await http.post('/api/v1/intel/pricing-matrix/publish').send({ items: [{ slug: 'mtx-domates', price: floor - 300 }], allowBelowFloor: true }).expect(201);
    expect(res.body.published).toEqual(['mtx-domates']);
  });

  it('yayın yazma yetkisi ister (token yok → 401)', async () => {
    await request(server).post('/api/v1/intel/pricing-matrix/publish').send({ items: [] }).expect(401);
    await request(server).get('/api/v1/intel/pricing-matrix').expect(401);
  });
});
