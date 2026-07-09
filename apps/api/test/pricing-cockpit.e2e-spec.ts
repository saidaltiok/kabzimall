import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEV_TENANT_ID } from '../src/common/tenant';
import { createTestApp, authed, resetDb } from './test-app';

/**
 * Fiyat Kokpiti: benim alışım (hal_purchases) / hal piyasa / rakip / satışım
 * bir arada + yüzdesel ilişkiler. OCR durum ucu anahtar yokken kapalı döner.
 */
describe('Fiyat Kokpiti + OCR durumu', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let prisma: PrismaService;
  const SLUG = 'kok-domates';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    prisma = app.get(PrismaService);
    // Satış fiyatı 80,00; hal piyasa 30,00; rakip 90,00; benim alışım 25,00/kg.
    await http.post('/api/v1/catalog/products').send({ slug: SLUG, name: 'Kokpit Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 8000, stockQty: 100 }).expect(201);
    await http.post('/api/v1/intel/hal/entries').send({ productId: SLUG, price: 3000, source: 'MANUAL' }).expect(201);
    await http.post('/api/v1/intel/hal-purchases').send({ productId: SLUG, recordedKg: 40, actualKg: 40, totalPaid: 100000 }).expect(201); // 25,00/kg
    const grp = await http.post('/api/v1/intel/competitor-groups').send({ name: 'Zincir' }).expect(201);
    const comp = await http.post('/api/v1/intel/competitors').send({ name: 'Rakip A', groupId: grp.body.id }).expect(201);
    await http.post('/api/v1/intel/competitor-prices/entries').send({ productId: SLUG, competitorId: comp.body.id, price: 9000 }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('kokpit tablosu: alış/hal/rakip/satış + yüzdeler doğru', async () => {
    const r = await http.get('/api/v1/intel/pricing-cockpit?days=30').expect(200);
    const row = r.body.rows.find((x: { slug: string }) => x.slug === SLUG);
    expect(row).toBeTruthy();
    expect(row.myBuy).toBe(2500);   // 1000₺ / 40kg
    expect(row.halAvg).toBe(3000);
    expect(row.compAvg).toBe(9000);
    expect(row.sell).toBe(8000);
    expect(row.buyVsHalPct).toBeCloseTo(-16.7, 0);   // alışım hal'den ~%17 ucuz
    expect(row.compVsHalPct).toBeCloseTo(200, 0);     // rakip hal'in 3 katı
    expect(row.sellVsBuyPct).toBeCloseTo(220, 0);     // satışım alışın 3.2 katı
    expect(row.sellVsCompPct).toBeCloseTo(-11.1, 0);  // rakipten ~%11 ucuz
  });

  it('tek ürün trend serisi: günlük alış/hal/rakip', async () => {
    const r = await http.get(`/api/v1/intel/pricing-cockpit/${SLUG}?days=30`).expect(200);
    expect(r.body.slug).toBe(SLUG);
    expect(r.body.series.length).toBeGreaterThanOrEqual(1);
    const withBuy = r.body.series.find((p: { myBuy: number | null }) => p.myBuy != null);
    expect(withBuy.myBuy).toBe(2500);
  });

  it('OCR durumu: anahtar yokken kapalı', async () => {
    const r = await http.get('/api/v1/intel/hal-purchases/ocr-status').expect(200);
    expect(r.body.enabled).toBe(false);
  });

  it('OCR ucu: anahtar yokken 400 (elle giriş yönlendirmesi)', async () => {
    await http.post('/api/v1/intel/hal-purchases/ocr').send({ image: 'data:image/jpeg;base64,' + 'x'.repeat(200), mediaType: 'image/jpeg' }).expect(400);
  });
});
