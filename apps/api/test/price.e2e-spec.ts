import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb, authed, DOMATES_COST } from './test-app';

describe('Intel /price uçları', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /intel/price/resolve', () => {
    it('rakipsiz Domates → fallback ile MARGIN, referans 3590 / ~%29 / directCost 2440', async () => {
      const res = await http
        .post('/api/v1/intel/price/resolve')
        .send({ cost: DOMATES_COST, baseParams: { targetMargin: 0.3, floorMargin: 0.15 } })
        .expect(200);

      expect(res.body.price).toBe(3590);
      expect(res.body.directCost).toBe(2440);
      expect(res.body.netMargin).toBeCloseTo(0.29, 2);
      expect(res.body.strategy).toBe('MARGIN');
      expect(res.body.usedFallback).toBe(true); // COMP_AVG atlandı (rakip yok)
      expect(res.body.competitionIndex).toBeNull();
      expect(res.body.currency).toBe('TRY-minor');
    });
  });

  describe('POST /intel/price/suggest', () => {
    it('MARGIN (tek strateji, fallback yok) → 3590, usedFallback false', async () => {
      const res = await http
        .post('/api/v1/intel/price/suggest')
        .send({ cost: DOMATES_COST, strategy: 'MARGIN', params: { targetMargin: 0.3 } })
        .expect(200);

      expect(res.body.price).toBe(3590);
      expect(res.body.strategy).toBe('MARGIN');
      expect(res.body.usedFallback).toBe(false);
    });

    it('COMP_AVG (5 rakip) → 4390, competitionIndex ~99', async () => {
      const competitors = [
        { name: 'A', group: 'Orta', price: 4900 },
        { name: 'B', group: 'Orta', price: 4600 },
        { name: 'C', group: 'İndirim', price: 4200 },
        { name: 'D', group: 'Orta', price: 4400 },
        { name: 'E', group: 'İndirim', price: 3990 },
      ];
      const res = await http
        .post('/api/v1/intel/price/suggest')
        .send({ cost: DOMATES_COST, competitors, strategy: 'COMP_AVG' })
        .expect(200);

      expect(res.body.price).toBe(4390);
      expect(res.body.competitionIndex).toBe(99);
    });

    it('geçersiz strateji → 400', async () => {
      await http
        .post('/api/v1/intel/price/suggest')
        .send({ cost: DOMATES_COST, strategy: 'BOGUS' })
        .expect(400);
    });

    it('fireRate >= 1 → 400 (whitelist/range doğrulaması)', async () => {
      await http
        .post('/api/v1/intel/price/suggest')
        .send({ cost: { ...DOMATES_COST, fireRate: 1 }, strategy: 'MARGIN' })
        .expect(400);
    });

    it('tanımsız alan gönderilince → 400 (forbidNonWhitelisted)', async () => {
      await http
        .post('/api/v1/intel/price/suggest')
        .send({ cost: DOMATES_COST, strategy: 'MARGIN', hacker: true })
        .expect(400);
    });
  });

  describe('POST /intel/price/apply → GET /intel/price/history', () => {
    it('iki kez uygula → base_price güncellenir, price_history zincirlenir', async () => {
      const first = await http
        .post('/api/v1/intel/price/apply')
        .send({ productId: 'domates', price: 3590, strategy: 'MARGIN', netMargin: 0.29, reason: 'İlk yayın', changedBy: 'said' })
        .expect(200);

      expect(first.body.product.basePrice).toBe(3590);
      expect(first.body.history.oldPrice).toBeNull();
      expect(first.body.history.newPrice).toBe(3590);
      expect(first.body.history.reason).toBe('İlk yayın'); // UTF-8 korunur

      const second = await http
        .post('/api/v1/intel/price/apply')
        .send({ productId: 'domates', price: 4390, strategy: 'COMP_AVG' })
        .expect(200);

      expect(second.body.product.basePrice).toBe(4390);
      expect(second.body.history.oldPrice).toBe(3590); // önceki fiyatı taşır
      expect(second.body.history.newPrice).toBe(4390);

      const history = await http
        .get('/api/v1/intel/price/history?productId=domates')
        .expect(200);

      expect(history.body.meta.total).toBe(2);
      expect(history.body.data[0].newPrice).toBe(4390); // en yeni önce
      expect(history.body.data[1].newPrice).toBe(3590);
    });

    it('geçersiz fiyat (0) → 400', async () => {
      await http
        .post('/api/v1/intel/price/apply')
        .send({ productId: 'x', price: 0, strategy: 'MANUAL' })
        .expect(400);
    });

    it('fiyat yayınlanınca eski indirim TEMİZLENİR (satış fiyatı gölgede kalmasın — bug #2)', async () => {
      // İndirimli ürün: base 12490, indirim 10990 → vitrinde 10990.
      await http.post('/api/v1/catalog/products')
        .send({ slug: 'avokado-t', name: 'Avokado T', saleType: 'PIECE', unitLabel: 'adet', basePrice: 12490, discountedPrice: 10990 })
        .expect(201);
      // Yeni fiyat yayınla (indirimden yüksek).
      const r = await http.post('/api/v1/intel/price/apply')
        .send({ productId: 'avokado-t', price: 15190, strategy: 'MARGIN', netMargin: 0.3 })
        .expect(200);
      expect(r.body.product.basePrice).toBe(15190);
      expect(r.body.product.discountedPrice).toBeNull(); // indirim temizlendi
      expect(r.body.discountCleared).toBe(true);
      // Vitrin artık yeni fiyatı gösterir (gölgeleme yok).
      const p = await http.get('/api/v1/catalog/products?search=avokado-t').expect(200);
      const row = p.body.data.find((x: { slug: string }) => x.slug === 'avokado-t');
      expect(row.discountedPrice).toBeNull();
      expect(row.basePrice).toBe(15190);
    });
  });
});
