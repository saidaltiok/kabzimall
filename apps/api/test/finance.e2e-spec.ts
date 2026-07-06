import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Finans: genel giderler + kâr/zarar', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let revenue = 0;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    await http.put('/api/v1/intel/cost-components').send({ scope: 'GLOBAL', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0 }).expect(200);
    await http.post('/api/v1/catalog/products').send({ slug: 'fin-elma', name: 'Finans Elma', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5000 }).expect(201);
    await http.post('/api/v1/intel/hal/entries').send({ productId: 'fin-elma', price: 3000, date: TODAY }).expect(201);

    const o = await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'fin-elma', qty: 2 }], customer: { name: 'Finans Testi', phone: '05551110071', address: 'Fin Mah. 1' } }).expect(201);
    revenue = o.body.grandTotal;
    await http.patch(`/api/v1/admin/orders/${o.body.id}/status`).send({ status: 'DELIVERED' }).expect(200);
  });

  afterAll(async () => { await app.close(); });

  describe('genel gider CRUD', () => {
    it('sabit ve oranlı gider oluşturur; doğrulama çalışır', async () => {
      await http.post('/api/v1/intel/finance/overheads').send({ name: 'Kira', category: 'RENT', kind: 'FIXED', amount: 3000000, period: 'MONTHLY' }).expect(201);
      await http.post('/api/v1/intel/finance/overheads').send({ name: 'Kart Komisyonu', category: 'COMMISSION', kind: 'RATE', rate: 0.03 }).expect(201);
      // hatalı: FIXED tutarsız, RATE oransız, geçersiz kategori
      await http.post('/api/v1/intel/finance/overheads').send({ name: 'X', kind: 'FIXED' }).expect(400);
      await http.post('/api/v1/intel/finance/overheads').send({ name: 'Y', kind: 'RATE', rate: 2 }).expect(400);
      await http.post('/api/v1/intel/finance/overheads').send({ name: 'Z', category: 'YOK' }).expect(400);
      const list = await http.get('/api/v1/intel/finance/overheads').expect(200);
      expect(list.body.meta.total).toBe(2);
    });

    it('token olmadan yazılamaz', async () => {
      await request(server).post('/api/v1/intel/finance/overheads').send({ name: 'X', kind: 'FIXED', amount: 100 }).expect(401);
    });
  });

  describe('kâr/zarar', () => {
    it('ciro − COGS − genel gider = net; oranlı gider ciroya, sabit gider prorata', async () => {
      const res = await http.get(`/api/v1/intel/finance/pnl?from=${TODAY}&to=${TODAY}`).expect(200);
      expect(res.body.revenue).toBe(revenue);
      expect(res.body.orderCount).toBe(1);
      expect(res.body.cogs).toBeGreaterThan(0);
      expect(res.body.missingCost).toEqual([]);
      expect(res.body.grossProfit).toBe(res.body.revenue - res.body.cogs);

      const rate = res.body.overheadBreakdown.find((b: { kind: string }) => b.kind === 'RATE');
      const fixed = res.body.overheadBreakdown.find((b: { kind: string }) => b.kind === 'FIXED');
      expect(rate.amountInRange).toBe(Math.round(0.03 * revenue));   // oranlı = %3 × ciro
      expect(fixed.amountInRange).toBe(Math.round(3000000 / 30));    // 1 günlük prorata
      const overheadTotal = rate.amountInRange + fixed.amountInRange;
      expect(res.body.overheadTotal).toBe(overheadTotal);
      expect(res.body.net).toBe(res.body.grossProfit - overheadTotal);
    });

    it('teslim edilmeyen sipariş ciroya girmez', async () => {
      await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'fin-elma', qty: 5 }], customer: { name: 'Bekleyen', phone: '05551110072', address: 'Fin Mah. 2' } }).expect(201);
      const res = await http.get(`/api/v1/intel/finance/pnl?from=${TODAY}&to=${TODAY}`).expect(200);
      expect(res.body.orderCount).toBe(1); // hâlâ yalnız teslim edilen
      expect(res.body.revenue).toBe(revenue);
    });

    it('geçersiz tarih → 400', async () => {
      await http.get('/api/v1/intel/finance/pnl?from=2026-13-40&to=2026-01-01').expect(400);
      await http.get('/api/v1/intel/finance/pnl').expect(400);
    });
  });
});
