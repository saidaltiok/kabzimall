import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEV_TENANT_ID } from '../src/common/tenant';
import { createTestApp, authed, resetDb } from './test-app';

/**
 * Excel (CSV) toplu düzenleme e2e — dışa aktar → değiştir → önizle → uygula:
 * TR biçim (BOM + ; + virgül ondalık), fark tespiti, maliyet tabanı güvenlik
 * ağı (taban altı satır reddedilir), PriceHistory + StockMovement izleri,
 * hata satırları (bilinmeyen slug, bozuk sayı), idempotentlik.
 */
describe('Excel toplu düzenleme', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    prisma = app.get(PrismaService);
    await http.post('/api/v1/catalog/products').send({ slug: 'xl-domates', name: 'XL Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5000, stockQty: 10 }).expect(201);
    await http.post('/api/v1/catalog/products').send({ slug: 'xl-elma', name: 'XL Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 4000 }).expect(201);
    // xl-domates'e maliyet tanımla → taban koruması test edilebilsin (hal ort. 30 ₺ + bileşenler)
    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.1, labor: 100, packaging: 50, fuel: 50, commissionRate: 0 }).expect(200);
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'xl-domates', price: 3000, source: 'MANUAL' }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  let csv: string;

  it('dışa aktarma: BOM + noktalı virgül + TR ondalık + başlık', async () => {
    const r = await http.get('/api/v1/catalog/products/export-csv').expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    csv = r.text;
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = csv.replace(/^﻿/, '').trim().split(/\r\n/);
    expect(lines[0]).toBe('slug;ad;kategori;birim;fiyat;indirimli;stok;aktif');
    const domates = lines.find((l) => l.startsWith('xl-domates;'))!;
    expect(domates).toContain('50,00'); // fiyat TR ondalık
    expect(domates).toContain(';EVET');
  });

  it('önizleme (apply=false): fark tespiti doğru, hiçbir şey yazılmaz', async () => {
    const edited = csv
      .replace('xl-domates;XL Domates;;kg;50,00;;10;EVET', 'xl-domates;XL Domates;;kg;60,00;55,00;8,5;EVET')
      .replace('xl-elma;XL Elma;;kg;40,00;;;EVET', 'xl-elma;XL Elma Yeni;;kg;40,00;;;HAYIR');
    const r = await http.post('/api/v1/catalog/products/import-csv').send({ csv: edited, apply: false }).expect(201);

    expect(r.body.applied).toBe(false);
    expect(r.body.summary.degisen).toBe(2);
    const dom = r.body.rows.find((x: { slug: string }) => x.slug === 'xl-domates');
    expect(dom.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ alan: 'fiyat', yeni: '60,00 ₺' }),
      expect.objectContaining({ alan: 'indirimli', yeni: '55,00 ₺' }),
      expect.objectContaining({ alan: 'stok', yeni: '8.5' }),
    ]));
    const elma = r.body.rows.find((x: { slug: string }) => x.slug === 'xl-elma');
    expect(elma.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ alan: 'ad', yeni: 'XL Elma Yeni' }),
      expect.objectContaining({ alan: 'aktif', yeni: 'HAYIR' }),
    ]));

    // Önizleme yazmadı:
    const p = await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: 'xl-domates' } });
    expect(p!.basePrice).toBe(5000);
    expect(p!.stockQty).toBe(10);
  });

  it('uygulama (apply=true): ürünler güncellenir, PriceHistory + StockMovement izi düşer', async () => {
    const edited = csv
      .replace('xl-domates;XL Domates;;kg;50,00;;10;EVET', 'xl-domates;XL Domates;;kg;60,00;55,00;8,5;EVET')
      .replace('xl-elma;XL Elma;;kg;40,00;;;EVET', 'xl-elma;XL Elma Yeni;;kg;40,00;;;HAYIR');
    const r = await http.post('/api/v1/catalog/products/import-csv').send({ csv: edited, apply: true }).expect(201);
    expect(r.body.applied).toBe(true);
    expect(r.body.summary.degisen).toBe(2);

    const dom = await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: 'xl-domates' } });
    expect(dom).toMatchObject({ basePrice: 6000, discountedPrice: 5500, stockQty: 8.5 });
    const elma = await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: 'xl-elma' } });
    expect(elma).toMatchObject({ name: 'XL Elma Yeni', isActive: false });

    const ph = await prisma.priceHistory.findFirst({ where: { tenantId: DEV_TENANT_ID, productId: dom!.id }, orderBy: { changedAt: 'desc' } });
    expect(ph).toMatchObject({ oldPrice: 5000, newPrice: 6000, strategyApplied: 'TOPLU_EXCEL' });
    const mv = await prisma.stockMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, productId: dom!.id, refCode: 'EXCEL' } });
    expect(mv!.delta).toBeCloseTo(-1.5);
  });

  it('idempotent: aynı dosya tekrar gönderilirse değişiklik 0', async () => {
    const edited = csv
      .replace('xl-domates;XL Domates;;kg;50,00;;10;EVET', 'xl-domates;XL Domates;;kg;60,00;55,00;8,5;EVET')
      .replace('xl-elma;XL Elma;;kg;40,00;;;EVET', 'xl-elma;XL Elma Yeni;;kg;40,00;;;HAYIR');
    const r = await http.post('/api/v1/catalog/products/import-csv').send({ csv: edited, apply: true }).expect(201);
    expect(r.body.summary.degisen).toBe(0);
  });

  it('maliyet güvenlik ağı: taban altı fiyat satırı REDDEDİLİR, diğer satırlar uygulanır', async () => {
    // xl-domates maliyeti ~30 ₺ + bileşenler → 10 ₺ taban altı; xl-elma maliyetsiz → serbest
    const body = [
      'slug;ad;kategori;birim;fiyat;indirimli;stok;aktif',
      'xl-domates;XL Domates;;kg;10,00;;8,5;EVET',
      'xl-elma;XL Elma Yeni;;kg;35,00;;;HAYIR',
    ].join('\r\n');
    const r = await http.post('/api/v1/catalog/products/import-csv').send({ csv: body, apply: true }).expect(201);

    const dom = r.body.rows.find((x: { slug: string }) => x.slug === 'xl-domates');
    expect(dom.errors[0]).toContain('taban');
    expect(r.body.summary.hatali).toBe(1);
    expect(r.body.summary.degisen).toBe(1);

    const p = await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: 'xl-domates' } });
    expect(p!.basePrice).toBe(6000); // dokunulmadı
    const elma = await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: 'xl-elma' } });
    expect(elma!.basePrice).toBe(3500); // uygulandı
  });

  it('hata satırları: bilinmeyen slug, bozuk sayı, geçersiz aktif, mükerrer slug', async () => {
    const body = [
      'slug;ad;kategori;birim;fiyat;indirimli;stok;aktif',
      'boyle-yok;Hayalet;;kg;10,00;;;EVET',
      'xl-elma;XL Elma Yeni;;kg;abc;;;HAYIR',
      'xl-domates;XL Domates;;kg;60,00;;8,5;BELKİ',
      'xl-domates;XL Domates;;kg;60,00;;8,5;EVET',
    ].join('\r\n');
    const r = await http.post('/api/v1/catalog/products/import-csv').send({ csv: body, apply: true }).expect(201);
    expect(r.body.summary.hatali).toBe(4); // hayalet + bozuk fiyat + geçersiz aktif + mükerrer slug
    expect(r.body.rows.find((x: { slug: string }) => x.slug === 'boyle-yok').errors[0]).toContain('bulunamadı');
    expect(r.body.summary.degisen).toBe(0);
  });

  it('fiyat boşaltmak reddedilir (Excel sütun silme kazası toplu felakete dönmesin)', async () => {
    const body = [
      'slug;ad;kategori;birim;fiyat;indirimli;stok;aktif',
      'xl-domates;XL Domates;;kg;;;8,5;EVET', // fiyat boş
    ].join('\r\n');
    const r = await http.post('/api/v1/catalog/products/import-csv').send({ csv: body, apply: true }).expect(201);
    expect(r.body.rows[0].errors[0]).toContain('fiyat boş olamaz');
    const p = await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: 'xl-domates' } });
    expect(p!.basePrice).toBe(6000); // dokunulmadı
  });

  it('bozuk başlık reddedilir; VIEWER içe alamaz (403)', async () => {
    await http.post('/api/v1/catalog/products/import-csv').send({ csv: 'a;b;c\n1;2;3', apply: false }).expect(400);
    const viewer = authed(app, 'VIEWER');
    await viewer.post('/api/v1/catalog/products/import-csv').send({ csv, apply: false }).expect(403);
  });
});
