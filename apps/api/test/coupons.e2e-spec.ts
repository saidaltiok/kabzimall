import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEV_TENANT_ID } from '../src/common/tenant';
import { createTestApp, authed, resetDb } from './test-app';

describe('Kuponlar (admin CRUD + storefront check + sipariş entegrasyonu)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;

  const CUSTOMER = { name: 'Kupon Testi', phone: '05551110099', address: 'Test Mah. No:1' };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Fiyatlı ürün: 35,90 ₺/kg → 10 kg = 359,00 ₺ ara toplam
    await http.post('/api/v1/catalog/products').send({ slug: 'kpn-urun', name: 'Kupon Ürünü', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('admin uçları', () => {
    it('kupon oluşturur — kod normalize edilir (küçük harf + Türkçe İ)', async () => {
      const res = await http.post('/api/v1/admin/coupons').send({ code: 'indirim10', type: 'PERCENT', value: 10, minSubtotal: 20000, maxUses: 1 }).expect(201);
      expect(res.body.code).toBe('INDIRIM10'); // i → İ → I
      expect(res.body.isActive).toBe(true);
      expect(res.body.usedCount).toBe(0);
    });

    it('aynı kod ikinci kez → 409', async () => {
      await http.post('/api/v1/admin/coupons').send({ code: 'INDIRIM10', type: 'PERCENT', value: 20 }).expect(409);
    });

    it('geçersiz kod/deger reddedilir', async () => {
      await http.post('/api/v1/admin/coupons').send({ code: 'a', type: 'PERCENT', value: 10 }).expect(400); // çok kısa
      await http.post('/api/v1/admin/coupons').send({ code: 'YUZDE150', type: 'PERCENT', value: 150 }).expect(400); // %>100
      await http.post('/api/v1/admin/coupons').send({ code: 'EKSI', type: 'FIXED', value: 0 }).expect(400);
    });

    it('listeler ve pasife alır', async () => {
      await http.post('/api/v1/admin/coupons').send({ code: 'KAPALI', type: 'FIXED', value: 1000 }).expect(201);
      const list = await http.get('/api/v1/admin/coupons').expect(200);
      const kapali = list.body.data.find((c: { code: string }) => c.code === 'KAPALI');
      await http.patch(`/api/v1/admin/coupons/${kapali.id}/active`).send({ isActive: false }).expect(200);
      const chk = await request(server).get('/api/v1/storefront/coupons/check?code=KAPALI&subtotal=50000').expect(200);
      expect(chk.body.valid).toBe(false);
    });

    it('token olmadan admin uçları kapalı', async () => {
      await request(server).get('/api/v1/admin/coupons').expect(401);
    });
  });

  describe('storefront check (önizleme — sayaç artmaz)', () => {
    it('geçerli kupon: indirim sunucuda hesaplanır', async () => {
      const res = await request(server).get('/api/v1/storefront/coupons/check?code=indirim10&subtotal=35900').expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.code).toBe('INDIRIM10');
      expect(res.body.discount).toBe(3590); // %10
    });

    it('asgari sepetin altında → geçersiz + açıklayıcı mesaj', async () => {
      const res = await request(server).get('/api/v1/storefront/coupons/check?code=INDIRIM10&subtotal=15000').expect(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.discount).toBe(0);
      expect(res.body.message).toContain('200');
    });

    it('bilinmeyen kod → geçersiz', async () => {
      const res = await request(server).get('/api/v1/storefront/coupons/check?code=YOKBOYLEKOD&subtotal=35900').expect(200);
      expect(res.body.valid).toBe(false);
    });

    it('süresi dolmuş kupon → geçersiz', async () => {
      await prisma.coupon.create({ data: { tenantId: DEV_TENANT_ID, code: 'ESKI', type: 'FIXED', value: 1000, expiresAt: new Date(Date.now() - 86400000) } });
      const res = await request(server).get('/api/v1/storefront/coupons/check?code=ESKI&subtotal=35900').expect(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toContain('süresi');
    });

    it('FIXED indirim ara toplamı aşamaz', async () => {
      await http.post('/api/v1/admin/coupons').send({ code: 'DEV500', type: 'FIXED', value: 50000 }).expect(201);
      const res = await request(server).get('/api/v1/storefront/coupons/check?code=DEV500&subtotal=10000').expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.discount).toBe(10000); // 500 ₺ değil, sepet kadar
    });
  });

  describe('sipariş entegrasyonu', () => {
    it('kuponlu sipariş: discountTotal + grandTotal doğru, sayaç artar', async () => {
      const res = await request(server)
        .post('/api/v1/storefront/orders')
        .send({ items: [{ slug: 'kpn-urun', qty: 10 }], customer: CUSTOMER, couponCode: 'indirim10' })
        .expect(201);
      expect(res.body.subtotal).toBe(35900);
      expect(res.body.discountTotal).toBe(3590);
      expect(res.body.couponCode).toBe('INDIRIM10');
      expect(res.body.grandTotal).toBe(res.body.subtotal - res.body.discountTotal + res.body.deliveryFee);

      const c = await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: DEV_TENANT_ID, code: 'INDIRIM10' } } });
      expect(c?.usedCount).toBe(1);
    });

    it('kullanım limiti dolunca sipariş 400 ile durur (sessizce indirimsiz geçmez)', async () => {
      await request(server)
        .post('/api/v1/storefront/orders')
        .send({ items: [{ slug: 'kpn-urun', qty: 10 }], customer: CUSTOMER, couponCode: 'INDIRIM10' })
        .expect(400);
    });

    it('geçersiz kuponla sipariş 400, kuponsuz sipariş indirimsiz geçer', async () => {
      await request(server)
        .post('/api/v1/storefront/orders')
        .send({ items: [{ slug: 'kpn-urun', qty: 1 }], customer: CUSTOMER, couponCode: 'YOKBOYLEKOD' })
        .expect(400);
      const res = await request(server)
        .post('/api/v1/storefront/orders')
        .send({ items: [{ slug: 'kpn-urun', qty: 1 }], customer: CUSTOMER })
        .expect(201);
      expect(res.body.discountTotal).toBe(0);
      expect(res.body.couponCode).toBeNull();
    });

    it('paketlemede PERCENT indirim gerçek gramaja ölçeklenir', async () => {
      // yeni kupon (limitsiz) + sipariş → tartıda 10 kg yerine 8 kg çıktı
      await http.post('/api/v1/admin/coupons').send({ code: 'PAKET10', type: 'PERCENT', value: 10 }).expect(201);
      const order = await request(server)
        .post('/api/v1/storefront/orders')
        .send({ items: [{ slug: 'kpn-urun', qty: 10 }], customer: CUSTOMER, couponCode: 'PAKET10' })
        .expect(201);
      expect(order.body.discountTotal).toBe(3590);

      const packed = await http
        .post(`/api/v1/admin/orders/${order.body.id}/pack`)
        .send({ items: [{ itemId: order.body.items[0].id, pickedQty: 8 }] })
        .expect(201);
      expect(packed.body.discountTotal).toBe(2872); // %10, gerçek gramaja (8×3590=28720) göre
      expect(packed.body.finalTotal).toBe(28720 - 2872 + order.body.deliveryFee);
    });
  });
});
