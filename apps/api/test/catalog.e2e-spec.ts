import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb, authed } from './test-app';

describe('Katalog (ürün/kategori)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app); // ADMIN
  });

  afterAll(async () => {
    await app.close();
  });

  it('kategori oluştur + listele', async () => {
    const c = await http.post('/api/v1/catalog/categories').send({ slug: 'meyve', name: 'Meyve' }).expect(201);
    categoryId = c.body.id;
    const list = await http.get('/api/v1/catalog/categories').expect(200);
    expect(list.body.meta.total).toBe(1);
  });

  it('ürün oluştur (kategori + birim + fiyat)', async () => {
    const res = await http
      .post('/api/v1/catalog/products')
      .send({ slug: 'cilek', name: 'Çilek', categoryId, saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6400, isFreshDaily: true, imageUrl: 'https://img.example/cilek.jpg' })
      .expect(201);
    productId = res.body.id;
    expect(res.body.slug).toBe('cilek');
    expect(res.body.category.name).toBe('Meyve');
    expect(res.body.basePrice).toBe(6400);
    expect(res.body.isFreshDaily).toBe(true);
    expect(res.body.imageUrl).toBe('https://img.example/cilek.jpg');
  });

  it('aynı slug → 409', async () => {
    await http
      .post('/api/v1/catalog/products')
      .send({ slug: 'cilek', name: 'Çilek 2', saleType: 'WEIGHT' })
      .expect(409);
  });

  it('geçersiz slug (büyük harf) → 400', async () => {
    await http.post('/api/v1/catalog/products').send({ slug: 'Cilek', name: 'X', saleType: 'WEIGHT' }).expect(400);
  });

  it('var olmayan kategori → 400', async () => {
    await http
      .post('/api/v1/catalog/products')
      .send({ slug: 'muz', name: 'Muz', saleType: 'WEIGHT', categoryId: '11111111-1111-4111-8111-111111111111' })
      .expect(400);
  });

  it('arama ile listele', async () => {
    const res = await http.get('/api/v1/catalog/products?search=çile').expect(200);
    expect(res.body.data.some((p: { slug: string }) => p.slug === 'cilek')).toBe(true);
  });

  it('güncelle (ad + pasifleştir)', async () => {
    const res = await http.patch(`/api/v1/catalog/products/${productId}`).send({ name: 'Çilek (yerli)', isActive: false }).expect(200);
    expect(res.body.name).toBe('Çilek (yerli)');
    expect(res.body.isActive).toBe(false);

    const onlyActive = await http.get('/api/v1/catalog/products?active=true').expect(200);
    expect(onlyActive.body.data.some((p: { id: string }) => p.id === productId)).toBe(false);
  });

  it('opsiyonel alanlar null ile temizlenebilir (sinirsiz/yok durumuna donus)', async () => {
    // limitli ürün
    const c = await http
      .post('/api/v1/catalog/products')
      .send({ slug: 'limonata', name: 'Limonata', saleType: 'PIECE', unitLabel: 'adet', basePrice: 2500, discountedPrice: 1900, stockQty: 10, maxPerOrder: 3 })
      .expect(201);
    expect(c.body.stockQty).toBe(10);
    expect(c.body.maxPerOrder).toBe(3);
    expect(c.body.discountedPrice).toBe(1900);

    // null göndererek temizle
    const u = await http
      .patch(`/api/v1/catalog/products/${c.body.id}`)
      .send({ stockQty: null, maxPerOrder: null, discountedPrice: null })
      .expect(200);
    expect(u.body.stockQty).toBeNull();
    expect(u.body.maxPerOrder).toBeNull();
    expect(u.body.discountedPrice).toBeNull();
  });

  it('geçmişi olmayan ürün silinir', async () => {
    const res = await http.delete(`/api/v1/catalog/products/${productId}`).expect(200);
    expect(res.body.deleted).toBe(true);
  });

  it('VIEWER ürün oluşturamaz → 403', async () => {
    const viewer = authed(app, 'VIEWER');
    await viewer.post('/api/v1/catalog/products').send({ slug: 'x', name: 'X', saleType: 'WEIGHT' }).expect(403);
  });
});
