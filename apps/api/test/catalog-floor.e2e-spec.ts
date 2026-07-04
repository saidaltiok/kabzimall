import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb, authed } from './test-app';

/**
 * Maliyet tabanı güvenlik ağı (katalog kapısı). Katalogdan elle yazılan satış
 * fiyatı (indirimli dâhil) maliyet tabanının altına inememeli — zararına satış
 * yalnızca bilinçli fırsat akışıyla yapılır. Maliyet/hal verisi yoksa kontrol
 * atlanır (doğrulanamaz). Bu davranış bu oturumda eklendi; bir regresyon
 * bir daha zararına satışı sessizce açmasın diye kilitliyoruz.
 */
describe('Katalog — maliyet tabanı guard', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  // GLOBAL maliyet: fire 0.15, labor 120, packaging 70, fuel 50, komisyon 0.03.
  // hal 40,00₺ → fireCost = 4000/0.85 = 4706 + 240 = 4946 directCost.
  // floor(%15) = 4946 / (1 - 0.15 - 0.03) = 4946 / 0.82 ≈ 6032 kuruş (60,32₺).
  const FLOOR = 6032;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app); // ADMIN
    await http.put('/api/v1/intel/cost-components')
      .send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 })
      .expect(200);
    // 'domates' için hal fiyatı → maliyet hesaplanabilir olsun.
    await http.post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 4000, date: '2026-07-04', source: 'MANUAL' })
      .expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('taban ÜSTÜ fiyatla ürün oluşturulur (201)', async () => {
    const res = await http.post('/api/v1/catalog/products')
      .send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 8000 })
      .expect(201);
    expect(res.body.basePrice).toBe(8000);
  });

  it('taban ALTI basePrice güncellemesi reddedilir (400)', async () => {
    const id = (await http.get('/api/v1/catalog/products?search=domates').expect(200)).body.data[0].id;
    const res = await http.patch(`/api/v1/catalog/products/${id}`).send({ basePrice: FLOOR - 1000 }).expect(400);
    expect(String(res.body.message)).toMatch(/taban/i);
  });

  it('taban ALTI indirimli fiyat da reddedilir (basePrice güvenli olsa bile) (400)', async () => {
    const id = (await http.get('/api/v1/catalog/products?search=domates').expect(200)).body.data[0].id;
    await http.patch(`/api/v1/catalog/products/${id}`).send({ discountedPrice: 3000 }).expect(400);
  });

  it('taban ÜSTÜ güncelleme geçer (200)', async () => {
    const id = (await http.get('/api/v1/catalog/products?search=domates').expect(200)).body.data[0].id;
    const res = await http.patch(`/api/v1/catalog/products/${id}`).send({ basePrice: 7000 }).expect(200);
    expect(res.body.basePrice).toBe(7000);
  });

  it('fiyata dokunmayan güncelleme (stok) tabandan etkilenmez (200)', async () => {
    const id = (await http.get('/api/v1/catalog/products?search=domates').expect(200)).body.data[0].id;
    const res = await http.patch(`/api/v1/catalog/products/${id}`).send({ stockQty: 25 }).expect(200);
    expect(res.body.stockQty).toBe(25);
  });

  it('maliyeti/hal verisi olmayan üründe kontrol atlanır — düşük fiyatla oluşur (201)', async () => {
    // 'egzotik' için hal fiyatı yok → directCost hesaplanamaz → guard atlar.
    const res = await http.post('/api/v1/catalog/products')
      .send({ slug: 'egzotik', name: 'Egzotik', saleType: 'PIECE', unitLabel: 'adet', basePrice: 100 })
      .expect(201);
    expect(res.body.basePrice).toBe(100);
  });

  it('taban ALTI fiyatla YENİ ürün oluşturma da reddedilir (400)', async () => {
    // 'domates' hal'i var; ikinci bir domates-benzeri slug aynı GLOBAL maliyetle
    // ama kendi hal'i yok → guard atlar. Bunun yerine mevcut hal'li slug'ı
    // silip taban altı yeniden oluşturmayı dene:
    const id = (await http.get('/api/v1/catalog/products?search=domates').expect(200)).body.data[0].id;
    await http.delete(`/api/v1/catalog/products/${id}`).expect(200);
    const res = await http.post('/api/v1/catalog/products')
      .send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: FLOOR - 500 })
      .expect(400);
    expect(String(res.body.message)).toMatch(/taban/i);
  });
});
