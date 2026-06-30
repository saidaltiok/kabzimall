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

  it('ürün notu: kalem bazında müşteri notu kaydedilir ve geri döner', async () => {
    const res = await request(server)
      .post('/api/v1/storefront/orders')
      .send({
        items: [{ slug: 'domates', qty: 1, note: '  Çok olgun olmasın  ' }, { slug: 'cilek', qty: 0.5 }],
        customer: { name: 'Veli Kaya', phone: '05551112233', address: 'Kadıköy, İstanbul' },
      })
      .expect(201);

    const detail = await request(server).get(`/api/v1/storefront/orders/${res.body.id}`).expect(200);
    const domates = detail.body.items.find((i: { productName: string }) => i.productName === 'Domates');
    const cilek = detail.body.items.find((i: { productName: string }) => i.productName === 'Çilek');
    expect(domates.note).toBe('Çok olgun olmasın'); // trim uygulanır
    expect(cilek.note).toBeNull(); // not yoksa null
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

  it('hazır sepet ayrı ürün: kendi fiyatı + içeriği + tek satır sipariş', async () => {
    await admin
      .post('/api/v1/catalog/baskets')
      .send({ slug: 'haftalik', name: 'Haftalık Sepet', basePrice: 11000, discountedPrice: 9900, components: [{ productSlug: 'domates', qty: 2 }, { productSlug: 'cilek', qty: 1 }] })
      .expect(201);

    const res = await request(server).get('/api/v1/storefront/baskets').expect(200);
    const b = res.body.data.find((x: { slug: string }) => x.slug === 'haftalik');
    expect(b.price).toBe(9900); // kendi indirimli fiyatı (effectivePrice)
    expect(b.components).toHaveLength(2);

    // sepet ayrı ürün → tek satır, kendi fiyatıyla sipariş
    const o = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'haftalik', qty: 1 }], customer: { name: 'Veli', phone: '05551112233', address: 'Mahalle 1' } })
      .expect(201);
    expect(o.body.items[0].unitPrice).toBe(9900);
    expect(o.body.subtotal).toBe(9900);

    // vitrin ürün grid'inde sepet GÖRÜNMEZ (ayrı bölümde)
    const grid = await request(server).get('/api/v1/storefront/products').expect(200);
    expect(grid.body.data.some((p: { slug: string }) => p.slug === 'haftalik')).toBe(false);
  });

  it('stok bütünlüğü: sepet satışı içeriği düşürür + iptal geri yükler', async () => {
    const elma = await admin
      .post('/api/v1/catalog/products')
      .send({ slug: 'elma-st', name: 'Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 4000, stockQty: 10 })
      .expect(201);
    await admin
      .post('/api/v1/catalog/baskets')
      .send({ slug: 'kutu', name: 'Elma Kutusu', basePrice: 7000, components: [{ productSlug: 'elma-st', qty: 2 }] })
      .expect(201);

    // sepet sipariş (qty 1) → elma 10 → 8
    const o = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'kutu', qty: 1 }], customer: { name: 'Ada', phone: '05551112233', address: 'Mahalle 5' } })
      .expect(201);
    let p = await admin.get(`/api/v1/catalog/products/${elma.body.id}`).expect(200);
    expect(p.body.stockQty).toBe(8);

    // iptal → stok geri 10
    await admin.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'CANCELLED' }).expect(200);
    p = await admin.get(`/api/v1/catalog/products/${elma.body.id}`).expect(200);
    expect(p.body.stockQty).toBe(10);

    // içerik stoğu yetmezse → 400 (6×2=12 > 10)
    await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'kutu', qty: 6 }], customer: { name: 'Ada', phone: '05551112233', address: 'Mahalle 5' } })
      .expect(400);
  });

  it('bildirim: sipariş + durum değişimi müşteri bildirimi üretir', async () => {
    const o = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'domates', qty: 1 }], customer: { name: 'Nur', phone: '05551112233', address: 'Mahalle 9' } })
      .expect(201);

    const d1 = await request(server).get(`/api/v1/storefront/orders/${o.body.id}`).expect(200);
    expect(d1.body.notifications).toHaveLength(1);
    expect(d1.body.notifications[0].message).toContain('alındı');

    await admin.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'PREPARING' }).expect(200);
    const d2 = await request(server).get(`/api/v1/storefront/orders/${o.body.id}`).expect(200);
    expect(d2.body.notifications).toHaveLength(2);
    expect(d2.body.notifications[1].message).toContain('hazırlan');
  });

  it('VIEWER durum güncelleyemez → 403', async () => {
    const viewer = authed(app, 'VIEWER');
    await viewer.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'READY' }).expect(403);
  });

  it('maks miktar: ürün başına sipariş limiti aşılırsa 400, limitte 201', async () => {
    await admin.post('/api/v1/catalog/products').send({ slug: 'sinirli', name: 'Sınırlı Ürün', saleType: 'PIECE', unitLabel: 'adet', basePrice: 1000, maxPerOrder: 3 }).expect(201);
    // vitrinde maxPerOrder görünür
    const p = await request(server).get('/api/v1/storefront/products/sinirli').expect(200);
    expect(p.body.maxPerOrder).toBe(3);

    const cust = { name: 'Veli', phone: '05551112233', address: 'Mahalle 1' };
    // 4 > 3 → 400
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'sinirli', qty: 4 }], customer: cust }).expect(400);
    // 3 = limit → 201
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'sinirli', qty: 3 }], customer: cust }).expect(201);
  });

  it('asgari sipariş: ayar altındaki sepet 400, ayar üstü 201; sadece yazarlar ayarlar', async () => {
    // varsayılan 0 (sınır yok)
    const s0 = await request(server).get('/api/v1/storefront/settings').expect(200);
    expect(s0.body.minOrderTotal).toBe(0);

    // VIEWER ayar değiştiremez
    await authed(app, 'VIEWER').put('/api/v1/admin/settings').send({ minOrderTotal: 5000 }).expect(403);

    // ADMIN asgari tutarı 100 ₺ yapar
    const up = await admin.put('/api/v1/admin/settings').send({ minOrderTotal: 10000 }).expect(200);
    expect(up.body.minOrderTotal).toBe(10000);
    expect((await request(server).get('/api/v1/storefront/settings')).body.minOrderTotal).toBe(10000);

    const cust = { name: 'Veli', phone: '05551112233', address: 'Mahalle 1' };
    // 35,90 ₺ < 100 ₺ → 400
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 1 }], customer: cust }).expect(400);
    // 3590×3 = 107,70 ₺ ≥ 100 ₺ → 201
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 3 }], customer: cust }).expect(201);

    // sonraki testler etkilenmesin diye sıfırla
    await admin.put('/api/v1/admin/settings').send({ minOrderTotal: 0 }).expect(200);
  });

  it('teslimat ücreti ayarlanabilir: eşik altı temel ücret, eşik üstü ücretsiz', async () => {
    // temel 1000, eşik 8000 (yalnız bu alanlar; minOrderTotal korunur)
    const up = await admin.put('/api/v1/admin/settings').send({ deliveryFee: 1000, freeDeliveryThreshold: 8000 }).expect(200);
    expect(up.body.deliveryFee).toBe(1000);
    expect(up.body.freeDeliveryThreshold).toBe(8000);
    expect(up.body.minOrderTotal).toBe(0); // önceki değer korundu
    expect((await request(server).get('/api/v1/storefront/settings')).body.deliveryFee).toBe(1000);

    const cust = { name: 'Veli', phone: '05551112233', address: 'Mahalle 1' };
    // 3590 < 8000 → temel ücret 1000
    const below = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 1 }], customer: cust }).expect(201);
    expect(below.body.deliveryFee).toBe(1000);
    expect(below.body.grandTotal).toBe(4590);
    // 3590×3 = 10770 ≥ 8000 → ücretsiz
    const above = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'domates', qty: 3 }], customer: cust }).expect(201);
    expect(above.body.deliveryFee).toBe(0);
    expect(above.body.grandTotal).toBe(10770);

    // varsayılana döndür
    await admin.put('/api/v1/admin/settings').send({ deliveryFee: 4990, freeDeliveryThreshold: 40000 }).expect(200);
  });

  it('sipariş sorgulama: kod + telefon eşleşirse 200, eşleşmezse 404', async () => {
    const made = await request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: [{ slug: 'domates', qty: 1 }], customer: { name: 'Zeynep Ak', phone: '0532 444 55 66', address: 'Bir adres 1' } })
      .expect(201);
    const code = made.body.code;

    // doğru kod + telefon (boşluklu format) → 200, aynı sipariş
    const ok = await request(server).get(`/api/v1/storefront/orders/lookup?code=${code}&phone=${encodeURIComponent('0532 444 55 66')}`).expect(200);
    expect(ok.body.id).toBe(made.body.id);
    // farklı format (boşluksuz) → yine 200
    await request(server).get(`/api/v1/storefront/orders/lookup?code=${code}&phone=05324445566`).expect(200);
    // yanlış telefon → 404
    await request(server).get(`/api/v1/storefront/orders/lookup?code=${code}&phone=05550000000`).expect(404);
    // yanlış kod → 404
    await request(server).get(`/api/v1/storefront/orders/lookup?code=KMYOKYOK&phone=05324445566`).expect(404);
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
