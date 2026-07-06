import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, authed, resetDb } from './test-app';

const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('Otomatik indirim (clearance) kuralları', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;

  /** Ürün oluştur + createdAt'i geriye çek (tedarik "eski" görünsün). */
  async function makeProduct(slug: string, opts: { basePrice: number; stockQty?: number | null; categoryId?: string; ageDays?: number }) {
    const p = await http.post('/api/v1/catalog/products').send({
      slug, name: slug, saleType: 'WEIGHT', unitLabel: 'kg',
      basePrice: opts.basePrice, ...(opts.stockQty !== undefined && opts.stockQty !== null ? { stockQty: opts.stockQty } : {}),
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    }).expect(201);
    await prisma.product.update({ where: { id: p.body.id }, data: { createdAt: daysAgo(opts.ageDays ?? 5) } });
    // stok girişi hareketi de "eski" olsun (PATCH stockQty MANUAL hareket üretir)
    await prisma.stockMovement.updateMany({ where: { productId: p.body.id }, data: { createdAt: daysAgo(opts.ageDays ?? 5) } });
    return p.body.id as string;
  }

  const get = (slug: string) => prisma.product.findFirst({ where: { slug }, select: { basePrice: true, discountedPrice: true, markdownAt: true } });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // GLOBAL maliyet + hal → domates benzeri ürünlerde maliyet hesaplanabilir
    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0 }).expect(200);
    const cat = await http.post('/api/v1/catalog/categories').send({ slug: 'md-yesillik', name: 'MD Yeşillik' }).expect(201);

    // Kapsamdaki ürünler (kategori kurallı):
    await makeProduct('md-roka', { basePrice: 2000, stockQty: 10, categoryId: cat.body.id, ageDays: 5 });      // eriyecek
    await makeProduct('md-marul', { basePrice: 3000, stockQty: 8, categoryId: cat.body.id, ageDays: 5 });      // EXCLUDE ile korunacak
    await makeProduct('md-taze', { basePrice: 2500, stockQty: 10, categoryId: cat.body.id, ageDays: 0 });      // taze (yeni) → inmez
    await makeProduct('md-stoksuz', { basePrice: 2200, stockQty: 0, categoryId: cat.body.id, ageDays: 5 });    // stok yok → inmez
    await makeProduct('md-takipsiz', { basePrice: 2100, categoryId: cat.body.id, ageDays: 5 });                // stok takipsiz → inmez
    await makeProduct('md-maliyetli', { basePrice: 6000, stockQty: 5, categoryId: cat.body.id, ageDays: 5 });  // maliyet tabanı testi (hal ile)
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'md-maliyetli', price: 4000, date: TODAY }).expect(201);
    // hal girişi tedarik sinyali DEĞİL (fiyat verisi) — ürün yine bayat kalmalı; hal purchases tablosu boş.

    // Kategori kuralı: her gün %10 fiyat düşür, zarar yok, tavan %50
    await http.put('/api/v1/intel/markdown/rules').send({ scope: 'CATEGORY', refId: 'md-yesillik', mode: 'PRICE_DECAY', pct: 0.1, staleDays: 2, allowBelowCost: false, maxTotalOffPct: 0.5 }).expect(200);
    // Ürün istisnası: marul kapsam dışı
    await http.put('/api/v1/intel/markdown/rules').send({ scope: 'PRODUCT', refId: 'md-marul', mode: 'EXCLUDE' }).expect(200);
  });

  afterAll(async () => { await app.close(); });

  it('kural doğrulama: geçersiz pct/scope/staleDays reddedilir', async () => {
    await http.put('/api/v1/intel/markdown/rules').send({ scope: 'CATEGORY', refId: 'x', pct: 1.5 }).expect(400);
    await http.put('/api/v1/intel/markdown/rules').send({ scope: 'YOK', refId: 'x' }).expect(400);
    await http.put('/api/v1/intel/markdown/rules').send({ scope: 'PRODUCT', refId: 'x', staleDays: 0 }).expect(400);
    await http.put('/api/v1/intel/markdown/rules').send({ scope: 'PRODUCT', refId: '' }).expect(400);
  });

  it('dry-run: yazmadan önizler', async () => {
    const res = await http.post('/api/v1/intel/markdown/run?dry=1').expect(201);
    expect(res.body.dryRun).toBe(true);
    const slugs = res.body.applied.map((a: { slug: string }) => a.slug);
    expect(slugs).toContain('md-roka');
    expect((await get('md-roka'))!.discountedPrice).toBeNull(); // yazılmadı
  });

  it('koşu: bayat+stoklu ürün iner; taze/stoksuz/takipsiz/istisna inmez', async () => {
    const res = await http.post('/api/v1/intel/markdown/run').expect(201);
    const bySlug = new Map(res.body.applied.map((a: { slug: string }) => [a.slug, a]));

    expect(bySlug.has('md-roka')).toBe(true);
    const roka = await get('md-roka');
    expect(roka!.discountedPrice).toBe(1800); // 2000 × 0.9
    expect(roka!.markdownAt).not.toBeNull();

    for (const s of ['md-marul', 'md-taze', 'md-stoksuz', 'md-takipsiz']) {
      expect(bySlug.has(s)).toBe(false);
      expect((await get(s))!.discountedPrice).toBeNull();
    }
  });

  it('aynı gün ikinci koşu ikinci kez indirmez (idempotent)', async () => {
    const res = await http.post('/api/v1/intel/markdown/run').expect(201);
    expect(res.body.applied.map((a: { slug: string }) => a.slug)).not.toContain('md-roka');
    expect((await get('md-roka'))!.discountedPrice).toBe(1800);
  });

  it('ertesi gün: indirim mevcut fiyattan devam eder, tavan (%50) aşılamaz', async () => {
    // markdownAt'i düne çek → yeni gün simülasyonu; birkaç tur koş
    for (let i = 0; i < 12; i++) {
      await prisma.product.updateMany({ where: { slug: 'md-roka' }, data: { markdownAt: daysAgo(1) } });
      await http.post('/api/v1/intel/markdown/run').expect(201);
    }
    const roka = await get('md-roka');
    expect(roka!.discountedPrice).toBe(1000); // tavan: 2000 × (1−0.5)
  });

  it('maliyet tabanı: allowBelowCost=false zararına inmez', async () => {
    // md-maliyetli: hal 4000 → directCost ≈ 4946; %10 inişler maliyette durmalı
    for (let i = 0; i < 6; i++) {
      await prisma.product.updateMany({ where: { slug: 'md-maliyetli' }, data: { markdownAt: i === 0 ? null : daysAgo(1) } });
      await http.post('/api/v1/intel/markdown/run').expect(201);
    }
    const p = await get('md-maliyetli');
    expect(p!.discountedPrice).toBe(4950); // directCost 4946 → 10 kuruşa yuvarlı
  });

  it('restok: pozitif stok hareketi gelince işaretli indirim temizlenir', async () => {
    const roka = await prisma.product.findFirst({ where: { slug: 'md-roka' }, select: { id: true } });
    await http.patch(`/api/v1/catalog/products/${roka!.id}`).send({ stockQty: 30 }).expect(200); // stok girişi (bugün)
    const res = await http.post('/api/v1/intel/markdown/run').expect(201);
    expect(res.body.cleared.map((c: { slug: string }) => c.slug)).toContain('md-roka');
    const after = await get('md-roka');
    expect(after!.discountedPrice).toBeNull();
    expect(after!.markdownAt).toBeNull();
  });

  it('vitrin: inen ürün Fırsatlar mantığına düşer (discounted < base)', async () => {
    const res = await request(server).get('/api/v1/storefront/products').expect(200);
    const m = res.body.data.find((p: { slug: string }) => p.slug === 'md-maliyetli');
    expect(m.discountedPrice).toBeLessThan(m.basePrice);
  });

  it('token olmadan kurallar/koşu kapalı', async () => {
    await request(server).get('/api/v1/intel/markdown/rules').expect(401);
    await request(server).post('/api/v1/intel/markdown/run').expect(401);
  });
});
