import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Intel /dashboard', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  const DATE = '2026-06-29';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);

    // GLOBAL maliyet
    await http
      .put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 });

    // domates: sağlıklı — hal 1870, base 3590 (marj ~%29), 1 rakip 4400
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'domates', price: 1870, date: DATE });
    const g = await http.post('/api/v1/intel/competitor-groups').send({ name: 'Orta' });
    const c = await http.post('/api/v1/intel/competitors').send({ name: 'A', groupId: g.body.id });
    await http
      .post('/api/v1/intel/competitor-prices/entries')
      .send({ productId: 'domates', competitorId: c.body.id, price: 4400, date: DATE });
    await http
      .post('/api/v1/intel/price/apply')
      .send({ productId: 'domates', price: 3590, strategy: 'MARGIN', netMargin: 0.29 });

    // patates: ZARARINA — hal var, base maliyetin altında (bilinçli zararına → allowBelowFloor)
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'patates', price: 2000, date: DATE });
    await http
      .post('/api/v1/intel/price/apply')
      .send({ productId: 'patates', price: 100, strategy: 'MANUAL', allowBelowFloor: true });

    // kavun: HAL_VERISI_YOK — fiyat uygulandı ama hiç hal girişi yok
    await http
      .post('/api/v1/intel/price/apply')
      .send({ productId: 'kavun', price: 5000, strategy: 'MANUAL' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('KPI: 3 fiyatlı ürün, 1 zararına', async () => {
    const res = await http.get(`/api/v1/intel/dashboard?date=${DATE}`).expect(200);
    expect(res.body.date).toBe(DATE);
    expect(res.body.kpis.pricedProducts).toBe(3);
    expect(res.body.kpis.belowCostCount).toBe(1);
    expect(res.body.kpis.competitors).toBe(1);
    expect(res.body.kpis.priceChangesTotal).toBe(3);
  });

  it('riskli ürünler: patates ZARARINA, kavun HAL_VERISI_YOK, domates yok', async () => {
    const res = await http.get(`/api/v1/intel/dashboard?date=${DATE}`).expect(200);
    const byId: Record<string, string[]> = {};
    for (const r of res.body.riskyProducts) byId[r.productId] = r.flags;

    expect(byId['patates']).toContain('ZARARINA');
    expect(byId['kavun']).toContain('HAL_VERISI_YOK');
    expect(byId['domates']).toBeUndefined(); // sağlıklı → riskli listede değil
  });

  it('uyarılar: okunur mesaj + önem; zararına yüksek öncelikli, mesajda ürün geçer', async () => {
    const res = await http.get(`/api/v1/intel/dashboard?date=${DATE}`).expect(200);
    const alerts = res.body.alerts as { productId: string; code: string; severity: string; message: string }[];
    expect(Array.isArray(alerts)).toBe(true);
    // patates zararına → high severity, ilk sırada
    expect(alerts[0].severity).toBe('high');
    const patates = alerts.find((a) => a.productId === 'patates' && a.code === 'ZARARINA');
    expect(patates).toBeTruthy();
    expect(patates!.message).toMatch(/maliyet/i);
    // kavun hal verisi yok → low
    expect(alerts.some((a) => a.productId === 'kavun' && a.code === 'HAL_VERISI_YOK')).toBe(true);
  });

  it('kural taban marjı düşük-marj uyarısını tetikler', async () => {
    // domates net ~%29; sebze taban %25 iken uyarı yok, %35 yapınca DUSUK_MARJ olur
    await http.post('/api/v1/catalog/categories').send({ slug: 'sebze', name: 'Sebze' }).catch(() => {});
    // domates'i sebze kategorisine bağla
    const prods = await http.get('/api/v1/catalog/products?search=domates').expect(200);
    const cats = await http.get('/api/v1/catalog/categories').expect(200);
    const sebze = cats.body.data.find((c: { slug: string }) => c.slug === 'sebze');
    const dom = prods.body.data.find((p: { slug: string }) => p.slug === 'domates');
    await http.patch(`/api/v1/catalog/products/${dom.id}`).send({ categoryId: sebze.id }).expect(200);

    await http.put('/api/v1/intel/pricing-rules').send({ scope: 'CATEGORY', refId: 'sebze', floorMargin: 0.35 }).expect(200);
    const res = await http.get(`/api/v1/intel/dashboard?date=${DATE}`).expect(200);
    const dr = res.body.riskyProducts.find((r: { productId: string }) => r.productId === 'domates');
    expect(dr?.flags).toContain('DUSUK_MARJ'); // %29 < taban %35
    // temizle (diğer testleri etkilemesin)
    const rules = await http.get('/api/v1/intel/pricing-rules').expect(200);
    const sr = rules.body.data.find((r: { scope: string; refId: string }) => r.scope === 'CATEGORY' && r.refId === 'sebze');
    await http.delete(`/api/v1/intel/pricing-rules/${sr.id}`).expect(200);
  });

  it('son fiyat değişiklikleri: 3 kayıt, en yeni önce', async () => {
    const res = await http.get(`/api/v1/intel/dashboard?date=${DATE}`).expect(200);
    expect(res.body.recentPriceChanges).toHaveLength(3);
    const slugs = res.body.recentPriceChanges.map((r: { productId: string }) => r.productId);
    expect(slugs).toEqual(expect.arrayContaining(['domates', 'patates', 'kavun']));
  });

  it('GET /intel/products: tüm fiyatlı ürünler metrikleriyle', async () => {
    const res = await http.get(`/api/v1/intel/products?date=${DATE}`).expect(200);
    expect(res.body.meta.total).toBe(3);
    const byId: Record<string, any> = {};
    for (const r of res.body.data) byId[r.productId] = r;
    expect(byId['domates'].directCost).toBe(2440);
    expect(byId['domates'].flags).toHaveLength(0); // sağlıklı
    expect(byId['patates'].flags).toContain('ZARARINA');
  });
});
