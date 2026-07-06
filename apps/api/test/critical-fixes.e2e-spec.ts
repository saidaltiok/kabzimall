import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, authed, resetDb } from './test-app';

const TODAY = new Date().toISOString().slice(0, 10);

/** Denetimde bulunan KRİTİK açıkların düzeltmelerini kilitler (regresyon önler). */
describe('Kritik düzeltmeler (denetim sonrası)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0 }).expect(200);
  });
  afterAll(async () => { await app.close(); });

  const order = (slug: string, qty: number, phone: string, extra: Record<string, unknown> = {}) =>
    request(server).post('/api/v1/storefront/orders').send({ items: [{ slug, qty }], customer: { name: 'Kritik Test', phone, address: 'Kritik Mah. 1' }, ...extra }).expect(201);

  describe('K2: price/apply taban marj güvenlik ağı', () => {
    beforeAll(async () => {
      await http.post('/api/v1/catalog/products').send({ slug: 'kf-domates', name: 'KF Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 8000 }).expect(201);
      await http.post('/api/v1/intel/hal/entries').send({ productId: 'kf-domates', price: 4000, date: TODAY }).expect(201);
    });

    it('taban altı fiyat bayraksız 400; allowBelowFloor ile geçer', async () => {
      const floor = (await http.get('/api/v1/intel/cost/kf-domates').expect(200)).body.directCost; // maliyet ~ taban altı sınır referansı
      await http.post('/api/v1/intel/price/apply').send({ productId: 'kf-domates', price: 100, strategy: 'MANUAL' }).expect(400);
      await http.post('/api/v1/intel/price/apply').send({ productId: 'kf-domates', price: 100, strategy: 'MANUAL', allowBelowFloor: true }).expect(200);
      expect(floor).toBeGreaterThan(100);
    });

    it('taban üstü fiyat sorunsuz uygulanır', async () => {
      const r = await http.post('/api/v1/intel/price/apply').send({ productId: 'kf-domates', price: 9000, strategy: 'MANUAL' }).expect(200);
      expect(r.body.product.basePrice).toBe(9000);
    });

    it('maliyeti tanımsız ürüne apply floor kontrolü atlar (maliyet yoksa engel yok)', async () => {
      // hal/cost yok → floor hesaplanamaz → düşük fiyat kabul
      await http.post('/api/v1/intel/price/apply').send({ productId: 'kf-egzotik', price: 100, strategy: 'MANUAL' }).expect(200);
    });

    it('olmayan slug ile apply → yer tutucu PASİF (vitrine düşmez)', async () => {
      await http.post('/api/v1/intel/price/apply').send({ productId: 'kf-hayalet', price: 5000, strategy: 'MANUAL' }).expect(200);
      const p = await prisma.product.findFirst({ where: { slug: 'kf-hayalet' }, select: { isActive: true } });
      expect(p?.isActive).toBe(false);
      const store = await request(server).get('/api/v1/storefront/products').expect(200);
      expect(store.body.data.some((x: { slug: string }) => x.slug === 'kf-hayalet')).toBe(false);
    });
  });

  describe('K1: durum makinesi + iptal→kasa/kupon tutarlılığı', () => {
    beforeAll(async () => {
      await http.post('/api/v1/catalog/products').send({ slug: 'kf-elma', name: 'KF Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5000, stockQty: 50 }).expect(201);
    });

    it('geçersiz geçiş reddedilir: CANCELLED terminal, DELIVERED yalnız iptale', async () => {
      const o = await order('kf-elma', 1, '05551110091');
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'CANCELLED' }).expect(200);
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'PREPARING' }).expect(400); // CANCELLED→* yasak

      const o2 = await order('kf-elma', 1, '05551110092');
      await http.patch(`/api/v1/admin/orders/${o2.body.id}/status`).send({ status: 'DELIVERED' }).expect(200); // ileri atlama ok
      await http.patch(`/api/v1/admin/orders/${o2.body.id}/status`).send({ status: 'READY' }).expect(400); // DELIVERED→READY yasak
      await http.patch(`/api/v1/admin/orders/${o2.body.id}/status`).send({ status: 'DELIVERED' }).expect(200); // aynı durum = no-op
    });

    it('teslim SONRASI iptal: kasa tahsilatı geri çıkar + kupon hakkı iade edilir', async () => {
      await http.post('/api/v1/admin/cash/open').send({ openingFloat: 0 }).expect(201);
      await http.post('/api/v1/admin/coupons').send({ code: 'KFTEK', type: 'FIXED', value: 500, maxUses: 1 }).expect(201);

      const o = await order('kf-elma', 2, '05551110093', { couponCode: 'KFTEK' });
      // kupon tek kullanımlık → ikinci sipariş kuponu kullanamaz
      await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'kf-elma', qty: 1 }], customer: { name: 'X', phone: '05551110094', address: 'A Mah. 1' }, couponCode: 'KFTEK' }).expect(400);

      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
      let cur = await http.get('/api/v1/admin/cash/current').expect(200);
      expect(cur.body.movements.filter((m: { category: string }) => m.category === 'SALE')).toHaveLength(1);

      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'CANCELLED' }).expect(200);
      cur = await http.get('/api/v1/admin/cash/current').expect(200);
      const rev = cur.body.movements.find((m: { category: string }) => m.category === 'SALE_REVERSAL');
      expect(rev).toBeTruthy();
      expect(rev.type).toBe('OUT');
      // net kasa: SALE +X, SALE_REVERSAL −X → 0
      expect(cur.body.totals.balance).toBe(0);

      // kupon hakkı iade edildi → tekrar kullanılabilir
      const chk = await request(server).get('/api/v1/storefront/coupons/check?code=KFTEK&subtotal=100000').expect(200);
      expect(chk.body.valid).toBe(true);
    });
  });

  describe('K4: COGS tarihsel maliyet (snapshot)', () => {
    it('teslim edilen siparişin COGS’u SONRADAN değişen maliyetten etkilenmez', async () => {
      await http.post('/api/v1/catalog/products').send({ slug: 'kf-kiraz', name: 'KF Kiraz', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 9000, stockQty: 50 }).expect(201);
      await http.post('/api/v1/intel/hal/entries').send({ productId: 'kf-kiraz', price: 3000, date: TODAY }).expect(201);

      const o = await order('kf-kiraz', 2, '05551110095'); // snapshot: bugünün maliyeti (~hal 3000)
      await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
      const pnl1 = await http.get(`/api/v1/intel/finance/pnl?from=${TODAY}&to=${TODAY}`).expect(200);
      const cogs1 = pnl1.body.cogs;
      expect(cogs1).toBeGreaterThan(0);

      // Maliyeti fırlat (hal 3000 → 9000): snapshot sayesinde geçmiş COGS DEĞİŞMEMELİ
      await http.post('/api/v1/intel/hal/entries').send({ productId: 'kf-kiraz', price: 9000, date: TODAY }).expect(201);
      const pnl2 = await http.get(`/api/v1/intel/finance/pnl?from=${TODAY}&to=${TODAY}`).expect(200);
      expect(pnl2.body.cogs).toBe(cogs1); // snapshot dondu → maliyet artışı geçmiş COGS'u değiştirmedi
      expect(pnl2.body.missingCost).not.toContain('kf-kiraz'); // bu ürünün maliyeti tanımlı
    });
  });

  describe('K3: müşteri token ayrı gizli ile — personel ucunda geçersiz', () => {
    it('müşteri OTP token’ı personel korumalı uçta 401 (ayrı secret + kind)', async () => {
      const req = await request(server).post('/api/v1/storefront/auth/request-otp').send({ email: 'kf@test.local' }).expect(201);
      const code = req.body.devCode; // LOG modunda kod döner
      const ver = await request(server).post('/api/v1/storefront/auth/verify-otp').send({ email: 'kf@test.local', code }).expect(201);
      expect(ver.body.token).toBeTruthy();
      // müşteri token'ı ile personel ucu → 401
      await request(server).get('/api/v1/admin/orders').set('Authorization', `Bearer ${ver.body.token}`).expect(401);
      // ama kendi müşteri ucunda çalışır
      await request(server).get('/api/v1/storefront/my-orders').set('Authorization', `Bearer ${ver.body.token}`).expect(200);
    });
  });
});
