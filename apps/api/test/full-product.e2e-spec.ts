import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, authed, resetDb } from './test-app';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** "Tam ürün" turu: askıda kasa, slot kapasitesi, puanlama, sorun→kredi, tazelik, inbox, eriyecekler. */
describe('Tam ürün turu (askıda kasa + slot kapasitesi + puan/telafi + tazelik + inbox)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;

  const order = (slugs: string[], phone: string, extra: Record<string, unknown> = {}) =>
    request(server).post('/api/v1/storefront/orders').send({
      items: slugs.map((slug) => ({ slug, qty: 1 })),
      customer: { name: 'Tam Ürün', phone, address: 'FP Mah. Deneme Sok. 1' }, ...extra,
    });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await prisma.supportTicket.deleteMany();
    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0 }).expect(200);
    await http.post('/api/v1/catalog/products').send({ slug: 'fp-elma', name: 'FP Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5000, stockQty: 100 }).expect(201);
    await http.post('/api/v1/catalog/products').send({ slug: 'fp-armut', name: 'FP Armut', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 30000, stockQty: 100 }).expect(201);
  });

  afterAll(async () => {
    await http.put('/api/v1/admin/settings').send({ slotCapacity: null }).expect(200); // kapasiteyi sıfırla
    await app.close();
  });

  describe('A1 — askıda kasa (para izi kaybolmaz)', () => {
    it('kasa KAPALIYKEN teslim edilen sipariş askıya düşer; açılışta oturuma bağlanır', async () => {
      expect((await http.get('/api/v1/admin/cash/current').expect(200)).body.session).toBeNull();
      const o = await order(['fp-elma'], '05551241001').expect(201);
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);

      const closedView = await http.get('/api/v1/admin/cash/current').expect(200);
      expect(closedView.body.session).toBeNull();
      const pending = closedView.body.pending.find((m: { refCode: string }) => m.refCode === o.body.code);
      expect(pending).toMatchObject({ type: 'IN', category: 'SALE', amount: o.body.grandTotal });
      expect(pending.note).toContain('askıda');

      const opened = await http.post('/api/v1/admin/cash/open').send({ openingFloat: 10000 }).expect(201);
      expect(opened.body.claimedPending).toBeGreaterThanOrEqual(1);
      const cur = await http.get('/api/v1/admin/cash/current').expect(200);
      expect(cur.body.movements.some((m: { refCode: string }) => m.refCode === o.body.code)).toBe(true);
      expect(cur.body.totals.balance).toBe(10000 + o.body.grandTotal);
    });
  });

  describe('A3 — slot kapasitesi', () => {
    it('kapasite 2: remaining düşer, dolan pencere listeden çıkar, dolu slota sipariş 400', async () => {
      await http.put('/api/v1/admin/settings').send({ slotCapacity: 2 }).expect(200);
      let slots = (await request(server).get('/api/v1/storefront/slots').expect(200)).body.data;
      const target = slots[0];
      expect(target.remaining).toBe(2);

      await order(['fp-elma'], '05551241002', { slot: { date: target.date, window: target.window } }).expect(201);
      slots = (await request(server).get('/api/v1/storefront/slots').expect(200)).body.data;
      expect(slots.find((s: { date: string; window: string }) => s.date === target.date && s.window === target.window).remaining).toBe(1);

      await order(['fp-elma'], '05551241003', { slot: { date: target.date, window: target.window } }).expect(201);
      slots = (await request(server).get('/api/v1/storefront/slots').expect(200)).body.data;
      expect(slots.some((s: { date: string; window: string }) => s.date === target.date && s.window === target.window)).toBe(false); // dolu → listede yok

      await order(['fp-elma'], '05551241004', { slot: { date: target.date, window: target.window } }).expect(400); // dolu slota sipariş yok
    });

    it('kapasite null: sınırsız (remaining null)', async () => {
      await http.put('/api/v1/admin/settings').send({ slotCapacity: null }).expect(200);
      const slots = (await request(server).get('/api/v1/storefront/slots').expect(200)).body.data;
      expect(slots[0].remaining).toBeNull();
    });
  });

  describe('E2 — teslim sonrası puanlama', () => {
    let orderId = '';
    beforeAll(async () => {
      const o = await order(['fp-elma'], '05551241005').expect(201);
      orderId = o.body.id;
    });

    it('teslim edilmeden puanlanamaz; teslim sonrası tek sefer; düşük puan destek açar', async () => {
      await request(server).post(`/api/v1/storefront/orders/${orderId}/rating`).send({ rating: 5 }).expect(400);
      await http.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'DELIVERED' }).expect(200);
      await request(server).post(`/api/v1/storefront/orders/${orderId}/rating`).send({ rating: 9 }).expect(400); // aralık dışı
      await request(server).post(`/api/v1/storefront/orders/${orderId}/rating`).send({ rating: 2, comment: 'Geç geldi' }).expect(201);
      await request(server).post(`/api/v1/storefront/orders/${orderId}/rating`).send({ rating: 5 }).expect(400); // tek sefer

      const o = await prisma.order.findUnique({ where: { id: orderId }, select: { rating: true, code: true } });
      expect(o?.rating).toBe(2);
      const ticket = await prisma.supportTicket.findFirst({ where: { orderCode: o!.code } });
      expect(ticket?.message).toContain('DÜŞÜK PUAN 2/5');
    });
  });

  describe('E1 — sorun bildirimi → otomatik telafi kuponu', () => {
    it('≤100₺ kalem: anında tek kullanımlık kupon; mükerrer bildirim 400', async () => {
      const o = await order(['fp-elma'], '05551241006').expect(201); // 50₺ kalem
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
      const itemId = o.body.items[0].id;

      const res = await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [itemId], reason: 'EZIK_CURUK', message: 'Elmalar ezikti' }).expect(201);
      expect(res.body.resolved).toBe(true);
      expect(res.body.amount).toBe(5000);
      expect(res.body.couponCode).toMatch(/^TELAFI-/);

      const chk = await request(server).get(`/api/v1/storefront/coupons/check?code=${res.body.couponCode}&subtotal=20000`).expect(200);
      expect(chk.body.valid).toBe(true);
      expect(chk.body.discount).toBe(5000);

      await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [itemId], reason: 'EKSIK' }).expect(400); // mükerrer
    });

    it('>100₺ kalem: kupon üretmez, destek kuyruğuna düşer', async () => {
      const o = await order(['fp-armut'], '05551241007').expect(201); // 300₺
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
      const res = await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [o.body.items[0].id], reason: 'YANLIS_URUN' }).expect(201);
      expect(res.body.resolved).toBe(false);
      const ticket = await prisma.supportTicket.findFirst({ where: { orderCode: o.body.code } });
      expect(ticket?.status).toBe('OPEN');
    });

    it('24 saati geçen teslimatta bildirim 400', async () => {
      const o = await order(['fp-elma'], '05551241008').expect(201);
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
      await prisma.orderStatusHistory.updateMany({ where: { orderId: o.body.id, toStatus: 'DELIVERED' }, data: { createdAt: daysAgo(2) } });
      await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [o.body.items[0].id], reason: 'EKSIK' }).expect(400);
    });

    it('teslim edilmemiş siparişte / geçersiz sebeple 400', async () => {
      const o = await order(['fp-elma'], '05551241009').expect(201);
      await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [o.body.items[0].id], reason: 'EKSIK' }).expect(400);
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
      await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [o.body.items[0].id], reason: 'OLMAYAN' }).expect(400);
      await request(server).post(`/api/v1/storefront/orders/${o.body.id}/issue`).send({ itemIds: [], reason: 'EKSIK' }).expect(400);
    });
  });

  describe('B5 — tazelik rozeti verisi', () => {
    it('son 24 saatte hal alımı olan ürün freshToday=true', async () => {
      await http.post('/api/v1/intel/hal-purchases').send({ productId: 'fp-elma', recordedKg: 10, totalPaid: 20000 }).expect(201);
      const res = await request(server).get('/api/v1/storefront/products').expect(200);
      expect(res.body.data.find((p: { slug: string }) => p.slug === 'fp-elma').freshToday).toBe(true);
      expect(res.body.data.find((p: { slug: string }) => p.slug === 'fp-armut').freshToday).toBe(false);
    });
  });

  describe('D1 — bildirim merkezi (inbox)', () => {
    it('yeni sipariş + saat talebi + açık destek sayıları döner', async () => {
      const o = await order(['fp-elma'], '05551241010').expect(201);
      const slots = (await request(server).get('/api/v1/storefront/slots').expect(200)).body.data;
      // slot atanmış sipariş gerekli değil; talep için önce slotlu sipariş oluştur
      const o2 = await order(['fp-elma'], '05551241011', { slot: { date: slots[0].date, window: slots[0].window } }).expect(201);
      await request(server).post(`/api/v1/storefront/orders/${o2.body.id}/slot-change`).send({ date: slots[1].date, window: slots[1].window }).expect(201);

      const inbox = await http.get('/api/v1/admin/orders/inbox').expect(200);
      expect(inbox.body.counts.newOrders).toBeGreaterThanOrEqual(2);
      expect(inbox.body.counts.slotRequests).toBeGreaterThanOrEqual(1);
      expect(inbox.body.counts.openTickets).toBeGreaterThanOrEqual(1); // E1 >100₺ bileti açık
      expect(inbox.body.counts.total).toBe(inbox.body.counts.newOrders + inbox.body.counts.slotRequests + inbox.body.counts.openTickets);
      expect(inbox.body.slotRequests[0].code).toBe(o2.body.code);
      expect(o.body.id).toBeTruthy();
    });
  });

  describe('A2 — eriyecekler görünürlüğü', () => {
    it('bayat ürün "bugün", tazesi listede değil', async () => {
      await http.put('/api/v1/intel/markdown/rules').send({ scope: 'PRODUCT', refId: 'fp-armut', mode: 'PRICE_DECAY', pct: 0.05, staleDays: 2 }).expect(200);
      const armut = await prisma.product.findFirst({ where: { slug: 'fp-armut' }, select: { id: true } });
      await prisma.product.update({ where: { id: armut!.id }, data: { createdAt: daysAgo(5) } });
      await prisma.stockMovement.updateMany({ where: { productId: armut!.id }, data: { createdAt: daysAgo(5) } });

      const up = await http.get('/api/v1/intel/markdown/upcoming').expect(200);
      expect(up.body.today.some((x: { slug: string }) => x.slug === 'fp-armut')).toBe(true);
      expect(up.body.today.some((x: { slug: string }) => x.slug === 'fp-elma')).toBe(false); // kuralı yok
    });
  });
});
