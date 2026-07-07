import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Kasa modülü (oturum + hareketler + otomatik beslemeler)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let pendingSale = 0; // kasa kapalıyken düşen askıda tahsilat (açılışta oturuma bağlanır)

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();
    await http.post('/api/v1/catalog/products').send({ slug: 'ksa-urun', name: 'Kasa Ürünü', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 10000 }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('kasa kapalıyken: hareket eklenemez; teslimat ASKIYA düşer (para izi kaybolmaz)', async () => {
    expect((await http.get('/api/v1/admin/cash/current').expect(200)).body.session).toBeNull();
    await http.post('/api/v1/admin/cash/movements').send({ type: 'IN', amount: 1000 }).expect(400);

    // kasa kapalıyken teslim edilen sipariş hata vermez; askıda (pending) kayda düşer
    const o = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'ksa-urun', qty: 1 }], customer: { name: 'Kasa Kapalı', phone: '05551110081', address: 'K Mah. 1' } }).expect(201);
    await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
    const cur = await http.get('/api/v1/admin/cash/current').expect(200);
    expect(cur.body.session).toBeNull();
    const pending = cur.body.pending.find((m: { refCode: string }) => m.refCode === o.body.code);
    expect(pending).toMatchObject({ type: 'IN', category: 'SALE', amount: o.body.grandTotal });
    pendingSale = o.body.grandTotal;
  });

  it('açılış: geçersiz bakiye 400; açılır; ikinci açılış 400', async () => {
    await http.post('/api/v1/admin/cash/open').send({ openingFloat: -5 }).expect(400);
    const s = await http.post('/api/v1/admin/cash/open').send({ openingFloat: 50000, note: 'Sabah' }).expect(201);
    expect(s.body.openingFloat).toBe(50000);
    expect(s.body.openedBy).toContain('@');
    expect(s.body.claimedPending).toBe(1); // askıdaki tahsilat oturuma bağlandı
    await http.post('/api/v1/admin/cash/open').send({ openingFloat: 10000 }).expect(400);
  });

  it('elle hareket: doğrulama + bakiye günceller', async () => {
    await http.post('/api/v1/admin/cash/movements').send({ type: 'YOK', amount: 100 }).expect(400);
    await http.post('/api/v1/admin/cash/movements').send({ type: 'OUT', amount: 0 }).expect(400);
    await http.post('/api/v1/admin/cash/movements').send({ type: 'OUT', category: 'HATALI', amount: 100 }).expect(400);

    await http.post('/api/v1/admin/cash/movements').send({ type: 'OUT', category: 'EXPENSE', amount: 15000, note: 'Poşet' }).expect(201);
    const cur = await http.get('/api/v1/admin/cash/current').expect(200);
    // açılış 50000 + askıdan bağlanan tahsilat − masraf
    expect(cur.body.totals).toEqual({ inSum: pendingSale, outSum: 15000, balance: 50000 + pendingSale - 15000 });
  });

  it('teslim edilen sipariş kasaya otomatik GİRİŞ düşer; durum tekrarı mükerrer düşmez', async () => {
    const o = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'ksa-urun', qty: 2 }], customer: { name: 'Kasa Satış', phone: '05551110082', address: 'K Mah. 2' } }).expect(201);
    await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);

    const cur = await http.get('/api/v1/admin/cash/current').expect(200);
    const sale = cur.body.movements.find((m: { category: string; refCode: string }) => m.category === 'SALE' && m.refCode === o.body.code);
    expect(sale).toMatchObject({ type: 'IN', amount: o.body.grandTotal, refCode: o.body.code });
    // Sipariş başına tek SALE kaydı (mükerrer koruması tenant genelinde).
    expect(cur.body.movements.filter((m: { refCode: string }) => m.refCode === o.body.code)).toHaveLength(1);
    expect(cur.body.totals.balance).toBe(50000 + pendingSale - 15000 + o.body.grandTotal);
  });

  it('hal alımı kasadan otomatik ÇIKIŞ düşer', async () => {
    await http.post('/api/v1/intel/hal-purchases').send({ productId: 'ksa-urun', recordedKg: 10, totalPaid: 30000 }).expect(201);
    const cur = await http.get('/api/v1/admin/cash/current').expect(200);
    const hal = cur.body.movements.find((m: { category: string }) => m.category === 'HAL_PURCHASE');
    expect(hal).toMatchObject({ type: 'OUT', amount: 30000 });
    expect(hal.refCode).toMatch(/^HAL:/);
    expect(cur.body.totals.balance).toBeGreaterThan(0); // kapanış sayımı gerçekçi kalsın
  });

  it('kapanış: beklenen hesaplanır, fark = sayılan − beklenen; kapandıktan sonra hareket eklenemez', async () => {
    const cur = await http.get('/api/v1/admin/cash/current').expect(200);
    const expected = cur.body.totals.balance;

    const closed = await http.post('/api/v1/admin/cash/close').send({ counted: expected - 250, note: 'Gün sonu' }).expect(201);
    expect(closed.body.expectedClose).toBe(expected);
    expect(closed.body.countedClose).toBe(expected - 250);

    expect((await http.get('/api/v1/admin/cash/current').expect(200)).body.session).toBeNull();
    await http.post('/api/v1/admin/cash/movements').send({ type: 'IN', amount: 100 }).expect(400);
    await http.post('/api/v1/admin/cash/close').send({ counted: 0 }).expect(400); // açık oturum yok

    const sessions = await http.get('/api/v1/admin/cash/sessions').expect(200);
    expect(sessions.body.data).toHaveLength(1);
    expect(sessions.body.data[0].variance).toBe(-250);
  });

  it('yeni oturum bağımsız başlar (önceki hareketler taşınmaz)', async () => {
    await http.post('/api/v1/admin/cash/open').send({ openingFloat: 20000 }).expect(201);
    const cur = await http.get('/api/v1/admin/cash/current').expect(200);
    expect(cur.body.movements).toHaveLength(0);
    expect(cur.body.totals.balance).toBe(20000);
  });

  it('token olmadan kapalı', async () => {
    await request(server).get('/api/v1/admin/cash/current').expect(401);
    await request(server).post('/api/v1/admin/cash/open').send({ openingFloat: 1 }).expect(401);
  });
});
