import { INestApplication } from '@nestjs/common';
import { createTestApp, authed, resetDb } from './test-app';

/** Kalıcı fiyat kuralları: CRUD + en-spesifik çözüm + öneriye varsayılan olarak sızma. */
describe('Intel fiyat kuralları (pricing_rules)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);

    // Kategori (sebze) + kategoriye bağlı domates ürünü
    const cat = await http.post('/api/v1/catalog/categories').send({ slug: 'sebze', name: 'Sebze' }).expect(201);
    categoryId = cat.body.id;
    await http.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', categoryId, saleType: 'WEIGHT', unitLabel: 'kg' }).expect(201);

    // Öneri girdileri: GLOBAL maliyet + domates hal ort. 1870
    await http
      .put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 })
      .expect(200);
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'domates', price: 1850, date: '2026-06-29' });
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'domates', price: 1890, date: '2026-06-29' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('kural upsert + listele', async () => {
    await http.put('/api/v1/intel/pricing-rules').send({ scope: 'GLOBAL', floorMargin: 0.2, targetMargin: 0.3 }).expect(200);
    const list = await http.get('/api/v1/intel/pricing-rules').expect(200);
    expect(list.body.meta.total).toBe(1);
    // upsert idempotent (aynı scope+refId güncellenir, çoğalmaz)
    await http.put('/api/v1/intel/pricing-rules').send({ scope: 'GLOBAL', floorMargin: 0.2, targetMargin: 0.35 }).expect(200);
    const list2 = await http.get('/api/v1/intel/pricing-rules').expect(200);
    expect(list2.body.meta.total).toBe(1);
  });

  it('CATEGORY için refId zorunlu; en-spesifik alan kazanır (PRODUCT>CATEGORY>GLOBAL)', async () => {
    await http.put('/api/v1/intel/pricing-rules').send({ scope: 'CATEGORY' }).expect(400); // refId yok
    await http.put('/api/v1/intel/pricing-rules').send({ scope: 'CATEGORY', refId: 'sebze', floorMargin: 0.25 }).expect(200);
    await http.put('/api/v1/intel/pricing-rules').send({ scope: 'PRODUCT', refId: 'domates', targetMargin: 0.4 }).expect(200);

    const eff = await http.get('/api/v1/intel/pricing-rules/resolve?productId=domates').expect(200);
    expect(eff.body.targetMargin).toBe(0.4); // PRODUCT kazandı
    expect(eff.body.floorMargin).toBe(0.25); // CATEGORY (sebze) kazandı
    expect(eff.body.matched.map((m: { scope: string }) => m.scope).sort()).toEqual(['CATEGORY', 'GLOBAL', 'PRODUCT']);
  });

  it('öneri kuralı varsayılan olarak uygular; çağrı parametresi kuralı ezer', async () => {
    // strateji/param verilmeden: PRODUCT targetMargin 0.4 uygulanır
    const withRule = await http.post('/api/v1/intel/price/suggest-product').send({ productId: 'domates', date: '2026-06-29' }).expect(200);
    // çağrı targetMargin 0.3 override → daha düşük fiyat
    const override = await http
      .post('/api/v1/intel/price/suggest-product')
      .send({ productId: 'domates', params: { targetMargin: 0.3 }, date: '2026-06-29' })
      .expect(200);
    expect(withRule.body.price).toBeGreaterThan(override.body.price);
    expect(override.body.price).toBe(3590); // referans %30
    expect(withRule.body.ruleMatched.length).toBeGreaterThan(0);
  });

  it('kural sil + VIEWER yazamaz (403)', async () => {
    const list = await http.get('/api/v1/intel/pricing-rules').expect(200);
    const productRule = list.body.data.find((r: { scope: string }) => r.scope === 'PRODUCT');
    await authed(app, 'VIEWER').put('/api/v1/intel/pricing-rules').send({ scope: 'GLOBAL', floorMargin: 0.1 }).expect(403);
    await authed(app, 'VIEWER').delete(`/api/v1/intel/pricing-rules/${productRule.id}`).expect(403);
    await http.delete(`/api/v1/intel/pricing-rules/${productRule.id}`).expect(200);
    const eff = await http.get('/api/v1/intel/pricing-rules/resolve?productId=domates').expect(200);
    expect(eff.body.targetMargin).toBe(0.35); // PRODUCT silindi → GLOBAL 0.35
  });
});
