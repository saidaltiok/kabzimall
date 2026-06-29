import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb, authed } from './test-app';

describe('Market (vitrin + sipariş)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let orderId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    admin = authed(app);
    server = app.getHttpServer();

    // Katalog: 2 fiyatlı (domates, cilek) + 1 fiyatsız (taslak)
    await admin.post('/api/v1/catalog/products').send({ slug: 'domates', name: 'Domates', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 });
    await admin.post('/api/v1/catalog/products').send({ slug: 'cilek', name: 'Çilek', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6400 });
    await admin.post('/api/v1/catalog/products').send({ slug: 'taslak', name: 'Taslak', saleType: 'WEIGHT' }); // fiyatsız
  });

  afterAll(async () => {
    await app.close();
  });

  it('vitrin: public, fiyatlı+yayında ürünler (auth gerekmez)', async () => {
    const res = await request(server).get('/api/v1/storefront/products').expect(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('domates');
    expect(slugs).toContain('cilek');
    expect(slugs).not.toContain('taslak'); // fiyatsız → vitrinde yok
    // maliyet alanı sızmamalı
    expect(res.body.data[0]).not.toHaveProperty('fireRate');
  });

  it('misafir sipariş: tutarlar sunucuda hesaplanır', async () => {
    const res = await request(server)
      .post('/api/v1/storefront/orders')
      .send({
        items: [{ slug: 'domates', qty: 2 }, { slug: 'cilek', qty: 0.5 }],
        customer: { name: 'Ayşe Yılmaz', phone: '05555555555', address: 'Kadıköy, İstanbul' },
        note: 'Zili çalmayın',
      })
      .expect(201);

    orderId = res.body.id;
    expect(res.body.code).toMatch(/^KM/);
    expect(res.body.subtotal).toBe(10380); // 3590×2 + 6400×0.5
    expect(res.body.deliveryFee).toBe(4990); // < 250 ₺
    expect(res.body.grandTotal).toBe(15370);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.items).toHaveLength(2);
  });

  it('sipariş detayını id ile getir (public)', async () => {
    const res = await request(server).get(`/api/v1/storefront/orders/${orderId}`).expect(200);
    expect(res.body.customerName).toBe('Ayşe Yılmaz');
  });

  it('bilinmeyen ürünle sipariş → 400', async () => {
    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'yok', qty: 1 }], customer: { name: 'Ali', phone: '05551112233', address: 'Bir yer 1' } })
      .expect(400);
  });

  it('fiyatsız ürünle sipariş → 400', async () => {
    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'taslak', qty: 1 }], customer: { name: 'Ali', phone: '05551112233', address: 'Bir yer 1' } })
      .expect(400);
  });

  it('admin sipariş listesi: token gerekir', async () => {
    await request(server).get('/api/v1/admin/orders').expect(401);
    const res = await admin.get('/api/v1/admin/orders').expect(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('admin durum güncelleme + geçersiz durum 400', async () => {
    const res = await admin.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'PREPARING' }).expect(200);
    expect(res.body.status).toBe('PREPARING');
    await admin.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'YOK' }).expect(400);
  });

  it('teslimat slotları listelenir (public) + sipariş slota bağlanır', async () => {
    const slotsRes = await request(server).get('/api/v1/storefront/slots').expect(200);
    expect(slotsRes.body.data.length).toBeGreaterThan(0);
    const slot = slotsRes.body.data[0]; // { date, window, label }
    expect(slot.label).toContain('Yarın');

    const res = await request(server)
      .post('/api/v1/storefront/orders')
      .send({
        items: [{ slug: 'domates', qty: 1 }],
        customer: { name: 'Veli', phone: '05551112233', address: 'Moda Cd. 1' },
        slot: { date: slot.date, window: slot.window },
      })
      .expect(201);
    expect(res.body.deliveryWindow).toBe(slot.window);
    expect(res.body.deliveryDate).toBeTruthy();
  });

  it('geçersiz slot → 400', async () => {
    await request(server)
      .post('/api/v1/storefront/orders')
      .send({
        items: [{ slug: 'domates', qty: 1 }],
        customer: { name: 'Veli', phone: '05551112233', address: 'Moda Cd. 1' },
        slot: { date: '2020-01-01', window: '10:00-13:00' },
      })
      .expect(400);
  });

  it('stok: sipariş stoğu düşürür, fazlası reddedilir', async () => {
    const created = await admin
      .post('/api/v1/catalog/products')
      .send({ slug: 'limon', name: 'Limon', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3000, stockQty: 5 })
      .expect(201);
    expect(created.body.stockQty).toBe(5);

    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'limon', qty: 2 }], customer: { name: 'Ali', phone: '05551112233', address: 'Sokak 1' } })
      .expect(201);

    const after = await admin.get(`/api/v1/catalog/products/${created.body.id}`).expect(200);
    expect(after.body.stockQty).toBe(3); // 5 − 2

    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'limon', qty: 10 }], customer: { name: 'Ali', phone: '05551112233', address: 'Sokak 1' } })
      .expect(400);
  });

  it('paketleme: gerçek gramajla tutar kesinleşir (estimated→final)', async () => {
    const o = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'domates', qty: 2 }], customer: { name: 'Zehra', phone: '05551112233', address: 'Sokak 2' } })
      .expect(201);
    expect(o.body.finalTotal).toBeNull();
    const itemId = o.body.items[0].id;
    const fee = o.body.deliveryFee;

    const packed = await admin
      .post(`/api/v1/admin/orders/${o.body.id}/pack`)
      .send({ items: [{ itemId, pickedQty: 1.85 }] })
      .expect(201);
    expect(packed.body.status).toBe('READY');
    expect(packed.body.items[0].pickedQty).toBe(1.85);
    expect(packed.body.finalTotal).toBe(6642 + fee); // round(3590×1.85)=6642
  });

  it('indirimli fiyat: sipariş indirimli fiyatı uygular', async () => {
    await admin
      .post('/api/v1/catalog/products')
      .send({ slug: 'elma', name: 'Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5000, discountedPrice: 4000 })
      .expect(201);

    const sf = await request(server).get('/api/v1/storefront/products?search=elma').expect(200);
    expect(sf.body.data[0].discountedPrice).toBe(4000);

    const o = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'elma', qty: 1 }], customer: { name: 'Can', phone: '05551112233', address: 'Sokak 3' } })
      .expect(201);
    expect(o.body.items[0].unitPrice).toBe(4000); // taban 5000 değil indirimli 4000
    expect(o.body.subtotal).toBe(4000);
  });

  it('hazır sepet: %10 indirimli toplam + sipariş paket fiyatını uygular', async () => {
    await admin
      .post('/api/v1/catalog/baskets')
      .send({ slug: 'haftalik', name: 'Haftalık Sepet', discountPct: 10, items: [{ productSlug: 'domates', qty: 2 }, { productSlug: 'cilek', qty: 1 }] })
      .expect(201);

    const res = await request(server).get('/api/v1/storefront/baskets').expect(200);
    const b = res.body.data.find((x: { slug: string }) => x.slug === 'haftalik');
    expect(b.itemsTotal).toBe(13580); // 3590×2 + 6400×1
    expect(b.total).toBe(12222); // %10 indirim
    expect(b.savings).toBe(1358);

    // basketSlug ile sipariş → paket indirimli birim fiyat (sunucuda)
    const o = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'domates', qty: 2, basketSlug: 'haftalik' }], customer: { name: 'Veli', phone: '05551112233', address: 'Mahalle 1' } })
      .expect(201);
    expect(o.body.items[0].unitPrice).toBe(3231); // 3590 − %10
  });

  it('VIEWER durum güncelleyemez → 403', async () => {
    const viewer = authed(app, 'VIEWER');
    await viewer.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'READY' }).expect(403);
  });

  it('teslimat bölgesi: hizmet ilçesi varsa sipariş kontrol edilir', async () => {
    await admin.post('/api/v1/admin/delivery-zones').send({ name: 'Kadıköy' }).expect(201);
    const z = await request(server).get('/api/v1/storefront/zones').expect(200);
    expect(z.body.data.some((x: { name: string }) => x.name === 'Kadıköy')).toBe(true);

    const cust = (district?: string) => ({ name: 'Veli', phone: '05551112233', address: 'Mahalle 1', district });
    // bölge dışı → 400
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 1 }], customer: cust('Beşiktaş') }).expect(400);
    // ilçe yok → 400
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 1 }], customer: cust() }).expect(400);
    // bölge içi → 201
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 1 }], customer: cust('Kadıköy') }).expect(201);
  });
});
