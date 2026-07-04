import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb, authed } from './test-app';

/**
 * Toplu yayına alma (publishPopular) da maliyet tabanı korumalı olmalı:
 * rakip fiyatı maliyetin altındaysa fiyat tabana yükseltilir (floored:true),
 * asla maliyet altına yazılmaz. Maliyeti bilinmeyen ürün rakip fiyatıyla
 * yayınlanır ama costUnknown:true ile işaretlenir. Bu davranış bu oturumda
 * eklendi; regresyon koruması.
 */
describe('Yayına al — maliyet tabanı koruması', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let compId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    // GLOBAL maliyet + domates hal → directCost ≈ 4946, floor(%15) ≈ 6032.
    await http.put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 })
      .expect(200);
    await http.post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 4000, date: '2026-07-04', source: 'MANUAL' })
      .expect(201);
    const g = await http.post('/api/v1/intel/competitor-groups').send({ name: 'İndirim' }).expect(201);
    const c = await http.post('/api/v1/intel/competitors').send({ name: 'Ucuzcu', groupId: g.body.id }).expect(201);
    compId = c.body.id;
    // Rakip fiyatı 45,00₺ → maliyet tabanının (60,32₺) ALTINDA.
    await http.post('/api/v1/intel/competitor-prices/entries')
      .send({ productId: 'domates', competitorId: compId, price: 4500, date: '2026-07-04' })
      .expect(201);
    // Ürün pasif başlasın (yayına alma aktifleştirecek).
    await http.post('/api/v1/catalog/products')
      .send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', isActive: false })
      .expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('coverage: rakip medyanı maliyet tabanının altında → belowFloor işaretli', async () => {
    const res = await http.get('/api/v1/intel/competitor-prices/coverage').expect(200);
    const row = res.body.rows.find((r: { slug: string }) => r.slug === 'domates');
    expect(row).toBeDefined();
    expect(row.belowFloor).toBe(true);
    expect(row.floorPrice).toBeGreaterThan(row.medianComp);
  });

  it('publish: rakip fiyatı maliyet altındaysa tabana yükseltilir (floored)', async () => {
    const res = await http.post('/api/v1/intel/competitor-prices/publish')
      .send({ slugs: ['domates'], basis: 'median' })
      .expect(201);
    expect(res.body.published).toBe(1);
    expect(res.body.flooredCount).toBe(1);
    const d = res.body.details[0];
    expect(d.floored).toBe(true);
    expect(d.competitorPrice).toBe(4500);       // rakip fiyatı
    expect(d.price).toBeGreaterThanOrEqual(6032); // tabana yükseltildi
  });

  it('yayınlanan ürün maliyetin altında DEĞİL (dashboard zararına saymaz)', async () => {
    const res = await http.get('/api/v1/intel/dashboard').expect(200);
    expect(res.body.kpis.belowCostCount).toBe(0);
  });
});
