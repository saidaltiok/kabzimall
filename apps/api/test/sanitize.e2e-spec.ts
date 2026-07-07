import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

/**
 * Vitrin yanıtı temizliği: müşteri uçları iç alanları (unitCostSnapshot,
 * personel e-postası changedBy/createdBy, 📌 dahili not) DÖNDÜRMEZ;
 * admin uçları döndürür (operasyon ihtiyacı).
 */
describe('Müşteri yanıtı sanitizasyonu', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let orderId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.1, labor: 100, packaging: 50, fuel: 50, commissionRate: 0 }).expect(200);
    await http.post('/api/v1/catalog/products').send({ slug: 'san-elma', name: 'San Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 4000, stockQty: 20 }).expect(201);

    const o = await request(app.getHttpServer()).post('/api/v1/storefront/orders').send({
      items: [{ slug: 'san-elma', qty: 2 }],
      customer: { name: 'Sanitize Test', phone: '05551237701', address: 'San Mah. 1' },
    }).expect(201);
    orderId = o.body.id;
    await http.patch(`/api/v1/admin/orders/${orderId}/status`).send({ status: 'DELIVERED' }).expect(200);
    await http.post(`/api/v1/admin/orders/${orderId}/note`).send({ note: 'gizli personel notu' }).expect(201);
    await http.post(`/api/v1/admin/orders/${orderId}/refund`).send({ items: [{ itemId: o.body.items[0].id, qty: 0.5 }], method: 'CASH' }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sipariş oluşturma yanıtı maliyet snapshot içermez', async () => {
    const o = await request(app.getHttpServer()).post('/api/v1/storefront/orders').send({
      items: [{ slug: 'san-elma', qty: 1 }],
      customer: { name: 'Sanitize İki', phone: '05551237702', address: 'San Mah. 2' },
    }).expect(201);
    expect(o.body.items[0]).not.toHaveProperty('unitCostSnapshot');
  });

  it('vitrin sipariş detayı: maliyet, personel e-postası ve 📌 not sızmaz; iade satırı temiz', async () => {
    const r = await request(app.getHttpServer()).get(`/api/v1/storefront/orders/${orderId}`).expect(200);
    for (const it of r.body.items) expect(it).not.toHaveProperty('unitCostSnapshot');
    for (const h of r.body.statusHistory) {
      expect(h).not.toHaveProperty('changedBy');
      expect(h.note ?? '').not.toContain('gizli personel notu');
    }
    for (const rf of r.body.refunds) expect(rf).not.toHaveProperty('createdBy');
    // Müşterinin görmesi gerekenler duruyor:
    expect(r.body.statusHistory.some((h: { toStatus: string }) => h.toStatus === 'DELIVERED')).toBe(true);
    expect(r.body.refunds[0].amount).toBe(2000);
  });

  it('admin sipariş listesi temizlenmemiştir (operasyon ihtiyacı)', async () => {
    const r = await http.get('/api/v1/admin/orders').expect(200);
    const o = r.body.data.find((x: { id: string }) => x.id === orderId);
    expect(o.items[0]).toHaveProperty('unitCostSnapshot');
    expect(o.statusHistory.some((h: { note: string | null }) => h.note?.includes('gizli personel notu'))).toBe(true);
  });
});
