import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEV_TENANT_ID } from '../src/common/tenant';
import { createTestApp, authed, resetDb } from './test-app';

/**
 * Tezgâh satışı (POS) e2e — tek para yolu doğrulaması:
 * satış → stok düşer + kasa SALE + ciroya dahil; sipariş listesi/inbox/müşteri
 * kartlarına GİRMEZ; iade mevcut iptal yolundan (stok geri + SALE_REVERSAL).
 */
describe('Tezgâh satışı (POS)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let prisma: PrismaService;

  const SLUG = 'pos-domates';
  const SLUG2 = 'pos-fiyatsiz';
  let saleId: string;
  let saleCode: string;

  const stockOf = async (slug: string) =>
    (await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug } }))!.stockQty!;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    prisma = app.get(PrismaService);
    await http.post('/api/v1/catalog/products').send({ slug: SLUG, name: 'POS Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5000, stockQty: 10 }).expect(201);
    await http.post('/api/v1/catalog/products').send({ slug: SLUG2, name: 'POS Fiyatsız', saleType: 'PIECE', unitLabel: 'adet', stockQty: 5 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('satış: TZG kodu, DELIVERED/POS, stok düşer, StockMovement POS, kasaya SALE düşer', async () => {
    const before = await stockOf(SLUG);
    const r = await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG, qty: 1.5 }] }).expect(201);
    saleId = r.body.id;
    saleCode = r.body.code;

    expect(saleCode.startsWith('TZG')).toBe(true);
    expect(r.body.status).toBe('DELIVERED');
    expect(r.body.channel).toBe('POS');
    expect(r.body.finalTotal).toBe(7500); // 1.5 kg × 50,00 ₺
    expect(r.body.warnings).toEqual([]);
    expect(await stockOf(SLUG)).toBeCloseTo(before - 1.5);

    const mv = await prisma.stockMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, refCode: saleCode } });
    expect(mv).toMatchObject({ reason: 'POS' });
    expect(mv!.delta).toBeCloseTo(-1.5);

    const cash = await prisma.cashMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, refCode: saleCode } });
    expect(cash).toMatchObject({ type: 'IN', category: 'SALE', amount: 7500 });
  });

  it('satır fiyatı ezme (pazarlık): unitPrice verilirse o geçerli', async () => {
    const r = await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG, qty: 2, unitPrice: 4000 }] }).expect(201);
    expect(r.body.finalTotal).toBe(8000);
    expect(r.body.items[0].unitPrice).toBe(4000);
  });

  it('sipariş listesi/inbox/müşteri kartlarına girmez; ciroya girer (posToday ayrık)', async () => {
    const orders = await http.get('/api/v1/admin/orders').expect(200);
    expect(orders.body.data.some((o: { code: string }) => o.code === saleCode)).toBe(false);

    const inbox = await http.get('/api/v1/admin/orders/inbox').expect(200);
    expect(inbox.body.newOrders.some((o: { code: string }) => o.code === saleCode)).toBe(false);

    const customers = await http.get('/api/v1/admin/customers').expect(200);
    expect(customers.body.data.some((c: { name: string }) => c.name === 'Tezgâh satışı')).toBe(false);

    const sum = await http.get('/api/v1/admin/orders/summary').expect(200);
    expect(sum.body.posToday.count).toBe(2);
    expect(sum.body.posToday.revenue).toBe(15500);
    expect(sum.body.revenueToday).toBeGreaterThanOrEqual(15500); // tezgâh ciroya dahil
    expect(sum.body.ordersToday).toBe(0); // web sipariş sayacına girmez
  });

  it('bugünün fişleri (today): satışlar listelenir, toplam canlı fişlerden', async () => {
    const r = await http.get('/api/v1/admin/pos/today').expect(200);
    expect(r.body.count).toBe(2);
    expect(r.body.total).toBe(15500);
    expect(r.body.sales.some((s: { code: string }) => s.code === saleCode)).toBe(true);
  });

  it('doğrulama: boş kalem / sıfır miktar / bilinmeyen ürün reddedilir', async () => {
    await http.post('/api/v1/admin/pos/sales').send({ items: [] }).expect(400);
    await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG, qty: 0 }] }).expect(400);
    await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: 'boyle-urun-yok', qty: 1 }] }).expect(400);
  });

  it('fiyatsız ürün: unitPrice olmadan 400, unitPrice ile satılır', async () => {
    await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG2, qty: 1 }] }).expect(400);
    const r = await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG2, qty: 2, unitPrice: 1500 }] }).expect(201);
    expect(r.body.finalTotal).toBe(3000);
  });

  it('aynı ürün iki satırda (pazarlık): satırlar ayrı, stok TEK harekette topluca düşer', async () => {
    const before = await stockOf(SLUG2);
    const r = await http.post('/api/v1/admin/pos/sales')
      .send({ items: [{ slug: SLUG2, qty: 1, unitPrice: 1000 }, { slug: SLUG2, qty: 2, unitPrice: 800 }] }).expect(201);
    expect(r.body.items.length).toBe(2);
    expect(r.body.finalTotal).toBe(1000 + 1600);
    expect(await stockOf(SLUG2)).toBeCloseTo(before - 3);
    const mvs = await prisma.stockMovement.findMany({ where: { tenantId: DEV_TENANT_ID, refCode: r.body.code } });
    expect(mvs.length).toBe(1); // parçalı değil, toplu iz
    expect(mvs[0].delta).toBeCloseTo(-3);
  });

  it('kuruş hassasiyeti: 0.567 kg × 35,00 ₺ = 19,85 ₺ (float kaybı yok)', async () => {
    const r = await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG, qty: 0.567, unitPrice: 3500 }] }).expect(201);
    expect(r.body.finalTotal).toBe(1985);
  });

  it('Int32 taşma koruması: aşırı toplam 400, stok değişmez', async () => {
    const before = await stockOf(SLUG);
    const items = [1, 2, 3].map(() => ({ slug: SLUG, qty: 1000, unitPrice: 10_000_00 }));
    await http.post('/api/v1/admin/pos/sales').send({ items }).expect(400);
    expect(await stockOf(SLUG)).toBeCloseTo(before);
  });

  it('stok aşımı: satış ENGELLENMEZ, uyarı döner, stok eksiye düşer', async () => {
    const stock = await stockOf(SLUG);
    const r = await http.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG, qty: stock + 3 }] }).expect(201);
    expect(r.body.warnings.length).toBe(1);
    expect(r.body.warnings[0]).toContain('eksiye düştü');
    expect(await stockOf(SLUG)).toBeCloseTo(-3);
  });

  it('VIEWER satış yapamaz (403)', async () => {
    const viewer = authed(app, 'VIEWER');
    await viewer.post('/api/v1/admin/pos/sales').send({ items: [{ slug: SLUG, qty: 1 }] }).expect(403);
  });

  it('iade: iptal → stok geri + kasadan SALE_REVERSAL çıkışı; today toplamından düşer', async () => {
    const before = await stockOf(SLUG);
    const totalBefore = (await http.get('/api/v1/admin/pos/today').expect(200)).body.total;

    await http.patch(`/api/v1/admin/orders/${saleId}/status`).send({ status: 'CANCELLED' }).expect(200);

    expect(await stockOf(SLUG)).toBeCloseTo(before + 1.5);
    const rev = await prisma.cashMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, refCode: saleCode, category: 'SALE_REVERSAL' } });
    expect(rev).toMatchObject({ type: 'OUT', amount: 7500 });

    const today = await http.get('/api/v1/admin/pos/today').expect(200);
    expect(today.body.sales.find((s: { code: string }) => s.code === saleCode).status).toBe('CANCELLED');
    expect(today.body.total).toBe(totalBefore - 7500);
  });
});
