import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('Intel /hal uçları (günlük fiyat girişi)', () => {
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

  it('POST /entries → kayıt oluşturur (append-only)', async () => {
    const res = await http
      .post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 1850, date: '2026-06-29', source: 'MANUAL' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.productId).toBe('domates');
    expect(res.body.price).toBe(1850);
    expect(res.body.date).toBe('2026-06-29');
  });

  it('aynı gün ikinci giriş → ızgarada günlük ortalama hesaplanır', async () => {
    await http
      .post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 1890, date: '2026-06-29' })
      .expect(201);

    const grid = await http.get('/api/v1/intel/hal?date=2026-06-29').expect(200);
    expect(grid.body.date).toBe('2026-06-29');

    const domates = grid.body.data.find((r: { productId: string }) => r.productId === 'domates');
    expect(domates.count).toBe(2);
    expect(domates.dailyAverage).toBe(1870); // (1850 + 1890) / 2
    expect(domates.entries).toHaveLength(2);
  });

  it('POST /bulk → çok ürünü tek seferde ekler, ortak tarih uygular', async () => {
    const res = await http
      .post('/api/v1/intel/hal/bulk')
      .send({
        date: '2026-06-30',
        entries: [
          { productId: 'salatalik', price: 1200 },
          { productId: 'biber', price: 2400 },
          { productId: 'patlican', price: 1700 },
        ],
      })
      .expect(201);

    expect(res.body.count).toBe(3);

    const grid = await http.get('/api/v1/intel/hal?date=2026-06-30').expect(200);
    expect(grid.body.data).toHaveLength(3);
    const biber = grid.body.data.find((r: { productId: string }) => r.productId === 'biber');
    expect(biber.dailyAverage).toBe(2400);
  });

  it('GET ?date= başka gün → o güne ait kayıt yoksa boş', async () => {
    const grid = await http.get('/api/v1/intel/hal?date=2020-01-01').expect(200);
    expect(grid.body.data).toHaveLength(0);
  });

  it('geçersiz tarih biçimi → 400', async () => {
    await http
      .post('/api/v1/intel/hal/entries')
      .send({ productId: 'domates', price: 1850, date: '29-06-2026' })
      .expect(400);
  });

  it('productId eksik → 400', async () => {
    await http.post('/api/v1/intel/hal/entries').send({ price: 1850 }).expect(400);
  });
});
