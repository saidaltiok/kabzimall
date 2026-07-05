import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, authed, resetDb } from './test-app';

describe('Destek talepleri + müşteri kartları', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    const prisma = app.get(PrismaService);
    await prisma.supportTicket.deleteMany();
    http = authed(app);
    server = app.getHttpServer();

    await http.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 }).expect(201);
    // iki müşteri: Ayşe 2 sipariş (1 iptal), Mehmet 1 sipariş
    const ayse = { name: 'Ayşe Test', phone: '05551110001', address: 'A Mah.', email: 'ayse@test.local' };
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 2 }], customer: ayse }).expect(201);
    const iptal = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 1 }], customer: ayse }).expect(201);
    await http.patch(`/api/v1/admin/orders/${iptal.body.id}/status`).send({ status: 'CANCELLED' }).expect(200);
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 3 }], customer: { name: 'Mehmet Test', phone: '05551110002', address: 'B Mah.' } }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('destek', () => {
    it('form talebi kuyruğa düşer (public)', async () => {
      const res = await request(server).post('/api/v1/storefront/support').send({ name: 'Ayşe Test', email: 'ayse@test.local', orderCode: 'km123abc', message: 'Siparişim eksik geldi.' }).expect(201);
      expect(res.body.ok).toBe(true);
      const list = await http.get('/api/v1/admin/support').expect(200);
      expect(list.body.meta.open).toBe(1);
      expect(list.body.data[0]).toMatchObject({ name: 'Ayşe Test', orderCode: 'KM123ABC', status: 'OPEN' });
    });

    it('iletişimsiz (e-posta/telefon yok) talep reddedilir', async () => {
      await request(server).post('/api/v1/storefront/support').send({ name: 'X', message: 'merhaba' }).expect(400);
    });

    it('yanıt + kapatma; repliedBy işlenir', async () => {
      const list = await http.get('/api/v1/admin/support').expect(200);
      const t = list.body.data[0];
      const upd = await http.patch(`/api/v1/admin/support/${t.id}`).send({ reply: 'Özür dileriz, eksik ürünün bedelini iade ettik.', status: 'CLOSED' }).expect(200);
      expect(upd.body.status).toBe('CLOSED');
      expect(upd.body.repliedBy).toContain('@');
      const after = await http.get('/api/v1/admin/support').expect(200);
      expect(after.body.meta.open).toBe(0);
    });

    it('IP başına günlük sınır aşılınca 400', async () => {
      for (let i = 0; i < 4; i++) {
        await request(server).post('/api/v1/storefront/support').send({ name: 'Spam', email: 's@t.local', message: `m${i}` }).expect(201);
      }
      await request(server).post('/api/v1/storefront/support').send({ name: 'Spam', email: 's@t.local', message: 'fazla' }).expect(400);
    });
  });

  describe('müşteri kartları', () => {
    it('telefonla gruplar: sipariş sayısı, iptal, ciro (iptal hariç)', async () => {
      const res = await http.get('/api/v1/admin/customers').expect(200);
      expect(res.body.meta.total).toBe(2);
      const ayse = res.body.data.find((c: { phone: string }) => c.phone === '05551110001');
      expect(ayse).toMatchObject({ name: 'Ayşe Test', orders: 2, cancelled: 1, email: 'ayse@test.local' });
      const mehmet = res.body.data.find((c: { phone: string }) => c.phone === '05551110002');
      expect(mehmet.orders).toBe(1);
      expect(mehmet.totalSpent).toBeGreaterThan(0);
    });

    it('arama ad/telefonla daraltır', async () => {
      const res = await http.get('/api/v1/admin/customers?search=mehmet').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].phone).toBe('05551110002');
    });

    it('tek müşterinin sipariş geçmişi döner', async () => {
      const res = await http.get('/api/v1/admin/customers/orders?phone=05551110001').expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].items[0].productName).toBe('Domates');
    });

    it('token olmadan kapalı', async () => {
      await request(server).get('/api/v1/admin/customers').expect(401);
      await request(server).get('/api/v1/admin/support').expect(401);
    });
  });
});
