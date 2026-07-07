import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEV_TENANT_ID } from '../src/common/tenant';
import { createTestApp, authed, resetDb } from './test-app';

/**
 * Kalem bazlı kısmi iade e2e — para/stok tutarlılığı:
 * DELIVERED şartı, oranlı kısmi miktar, tahsilat tavanı, nakit→kasa SALE_REVERSAL
 * (IADE:{id} refCode), kupon→tek kullanımlık FIXED, restock ops., K-Z net ciro,
 * iadesi olan sipariş tam iptal edilemez.
 */
describe('Kısmi iade', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let prisma: PrismaService;

  const SLUG = 'iade-cilek';
  let orderId: string;
  let orderCode: string;
  let itemId: string;

  const stockOf = async () =>
    (await prisma.product.findFirst({ where: { tenantId: DEV_TENANT_ID, slug: SLUG } }))!.stockQty!;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    prisma = app.get(PrismaService);
    await http.post('/api/v1/catalog/products').send({ slug: SLUG, name: 'İade Çilek', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 10000, stockQty: 20 }).expect(201);
    // Teslimat ücreti 0 → tutar matematiği net kalsın (2 kg × 100 ₺ = tam 200,00 ₺ tahsilat)
    await http.put('/api/v1/admin/settings').send({ minOrderTotal: 0, deliveryTiers: [{ minSubtotal: 0, fee: 0 }] }).expect(200);

    // Sipariş: 2 kg çilek → teslim (200,00 ₺ tahsil edildi)
    const o = await request(app.getHttpServer()).post('/api/v1/storefront/orders').send({
      items: [{ slug: SLUG, qty: 2 }],
      customer: { name: 'İade Test', phone: '05551239901', address: 'İade Mah. 1' },
    }).expect(201);
    orderId = o.body.id;
    orderCode = o.body.code;
    itemId = o.body.items[0].id;
    await http.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'DELIVERED' }).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('teslim edilmemiş siparişte iade 400', async () => {
    const o2 = await request(app.getHttpServer()).post('/api/v1/storefront/orders').send({
      items: [{ slug: SLUG, qty: 1 }],
      customer: { name: 'İade İkinci', phone: '05551239902', address: 'İade Mah. 2' },
    });
    if (o2.status !== 201) console.log('O2 HATA:', o2.status, JSON.stringify(o2.body));
    expect(o2.status).toBe(201);
    await http.post(`/api/v1/admin/orders/${o2.body.id}/refund`)
      .send({ items: [{ itemId: o2.body.items[0].id }], method: 'CASH' }).expect(400);
    await http.patch(`/api/v1/admin/orders/${o2.body.id}/status`).send({ status: 'CANCELLED' }).expect(200); // temizlik
  });

  it('kısmi miktar (0.5/2 kg) nakit iade: oranlı tutar + kasa SALE_REVERSAL + stok değişmez (restock yok)', async () => {
    const stockBefore = await stockOf();
    const r = await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId, qty: 0.5 }], method: 'CASH', reason: 'ezik çilek' }).expect(201);

    expect(r.body.refunds.length).toBe(1);
    const ref = r.body.refunds[0];
    expect(ref.amount).toBe(5000); // 200,00 ₺ × 0.5/2
    expect(ref.method).toBe('CASH');

    const cash = await prisma.cashMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, refCode: `IADE:${ref.id}` } });
    expect(cash).toMatchObject({ type: 'OUT', category: 'SALE_REVERSAL', amount: 5000 });
    expect(await stockOf()).toBeCloseTo(stockBefore); // restock istenmedi

    const note = r.body.statusHistory.find((h: { note: string | null }) => h.note?.startsWith('↩'));
    expect(note.note).toContain('ezik çilek');
  });

  it('iadesi olan sipariş tam iptal edilemez (çifte iade koruması)', async () => {
    await http.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'CANCELLED' }).expect(400);
  });

  it('kupon iadesi: tek kullanımlık IADE- kuponu üretilir, restock stoğu artırır', async () => {
    const stockBefore = await stockOf();
    const r = await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId, qty: 1 }], method: 'COUPON', restock: true }).expect(201);

    const ref = r.body.refunds[1];
    expect(ref.amount).toBe(10000);
    expect(ref.couponCode).toMatch(/^IADE-/);
    expect(await stockOf()).toBeCloseTo(stockBefore + 1);

    const mv = await prisma.stockMovement.findFirst({ where: { tenantId: DEV_TENANT_ID, refCode: orderCode, reason: 'REFUND' } });
    expect(mv!.delta).toBeCloseTo(1);

    const chk = await request(app.getHttpServer())
      .get(`/api/v1/storefront/coupons/check?code=${ref.couponCode}&subtotal=20000`).expect(200);
    expect(chk.body.discount).toBe(10000);
  });

  it('tavan: toplam iade tahsilatı aşamaz', async () => {
    // Ödenen 20000; iade edilen 5000+10000=15000; kalan 5000 → 1 kg (10000) istemek 400
    await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId, qty: 1 }], method: 'CASH' }).expect(400);
    // 0.5 kg (5000) tam sığar
    const r = await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId, qty: 0.5 }], method: 'CASH' }).expect(201);
    expect(r.body.refunds.length).toBe(3);
    // Artık tek kuruş bile iade edilemez
    await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId, qty: 0.1 }], method: 'CASH' }).expect(400);
  });

  it('doğrulama: yabancı kalem / aşırı miktar / boş kalem / VIEWER reddedilir', async () => {
    await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId: '00000000-0000-4000-8000-000000000000' }], method: 'CASH' }).expect(400);
    await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId, qty: 99 }], method: 'CASH' }).expect(400);
    await http.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [], method: 'CASH' }).expect(400);
    const viewer = authed(app, 'VIEWER');
    await viewer.post(`/api/v1/admin/orders/${orderId}/refund`)
      .send({ items: [{ itemId }], method: 'CASH' }).expect(403);
  });

  it('yeniden paketleme korumaları: DELIVERED pack 400; iadesi olan sipariş paketlenemez', async () => {
    // orderId DELIVERED + iadeli — pack artık reddedilmeli (iade tavanı finalTotal'a dayanır)
    await http.post(`/api/v1/admin/orders/${orderId}/pack`)
      .send({ items: [{ itemId, pickedQty: 1.9 }] }).expect(400);
  });

  it('eşzamanlı iade yarışı: tavanı birlikte aşan iki istekten yalnız biri geçer', async () => {
    // Yeni sipariş: 2 kg = 200,00 ₺; iki paralel 1.5 kg iade (150+150 > 200) → tek 201
    const o = await request(app.getHttpServer()).post('/api/v1/storefront/orders').send({
      items: [{ slug: SLUG, qty: 2 }],
      customer: { name: 'Yarış Testi', phone: '05551239903', address: 'İade Mah. 3' },
    }).expect(201);
    await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
    const iid = o.body.items[0].id;

    const [a, b] = await Promise.all([
      http.post(`/api/v1/admin/orders/${o.body.id}/refund`).send({ items: [{ itemId: iid, qty: 1.5 }], method: 'CASH' }),
      http.post(`/api/v1/admin/orders/${o.body.id}/refund`).send({ items: [{ itemId: iid, qty: 1.5 }], method: 'CASH' }),
    ]);
    expect([a.status, b.status].filter((s) => s === 201).length).toBe(1);
    const refs = await prisma.orderRefund.findMany({ where: { tenantId: DEV_TENANT_ID, orderId: o.body.id } });
    expect(refs.reduce((s, r) => s + r.amount, 0)).toBe(15000); // tavan (20000) aşılmadı
  });

  it('çifte tazmin koruması: otomatik telafi kuponu olan siparişe kupon iadesi 400, nakit uyarıyla geçer', async () => {
    const o = await request(app.getHttpServer()).post('/api/v1/storefront/orders').send({
      items: [{ slug: SLUG, qty: 0.5 }], // 50,00 ₺ ≤ 100 ₺ otomatik telafi sınırı
      customer: { name: 'Telafi Testi', phone: '05551239904', address: 'İade Mah. 4' },
    }).expect(201);
    await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
    const iid = o.body.items[0].id;

    const issue = await request(app.getHttpServer()).post(`/api/v1/storefront/orders/${o.body.id}/issue`)
      .send({ itemIds: [iid], reason: 'EZIK_CURUK', message: 'ezilmiş' }).expect(201);
    expect(issue.body.resolved).toBe(true); // TELAFI kuponu verildi

    await http.post(`/api/v1/admin/orders/${o.body.id}/refund`)
      .send({ items: [{ itemId: iid, qty: 0.2 }], method: 'COUPON' }).expect(400);
    const r = await http.post(`/api/v1/admin/orders/${o.body.id}/refund`)
      .send({ items: [{ itemId: iid, qty: 0.2 }], method: 'CASH' }).expect(201);
    const note = r.body.statusHistory.find((h: { note: string | null }) => h.note?.startsWith('↩'));
    expect(note.note).toContain('telafi kuponu da verilmişti');
  });

  it('K-Z: iadeler net cirodan düşer', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await http.get(`/api/v1/intel/finance/pnl?from=${today}&to=${today}`).expect(200);
    // Teslim edilen: 20000 (ana) + 20000 (yarış) + 5000 (telafi) = 45000
    expect(r.body.revenue).toBe(45000);
    // İadeler: 20000 (ana: 5000+10000+5000) + 15000 (yarış) + 2000 (telafi 0.2/0.5) = 37000
    expect(r.body.refundTotal).toBe(37000);
    expect(r.body.netRevenue).toBe(8000);
    expect(r.body.grossProfit).toBe(r.body.netRevenue - r.body.cogs);
  });
});
