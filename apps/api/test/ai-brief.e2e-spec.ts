import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('AI günlük özet (anahtar yokken kural bazlı)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // test her zaman kural modunda koşar
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    await http.post('/api/v1/catalog/products').send({ slug: 'brf-urun', name: 'Brifing Ürünü', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590 }).expect(201);
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'brf-urun', qty: 2 }], customer: { name: 'Brif', phone: '05551110044', address: 'D Mah.' } }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('kural bazlı brifing bugünün rakamlarını içerir', async () => {
    const res = await http.get('/api/v1/intel/ai/daily-brief').expect(200);
    expect(res.body.source).toBe('rules');
    expect(res.body.text).toContain('1 sipariş');
    expect(res.body.generatedAt).toBeTruthy();
  });

  it('gün içinde önbellekten döner, force ile tazelenir', async () => {
    const a = await http.get('/api/v1/intel/ai/daily-brief').expect(200);
    // yeni sipariş — önbellek eski rakamı korur
    await request(server).post('/api/v1/storefront/orders').send({ items: [{ slug: 'brf-urun', qty: 1 }], customer: { name: 'Brif', phone: '05551110044', address: 'D Mah.' } }).expect(201);
    const b = await http.get('/api/v1/intel/ai/daily-brief').expect(200);
    expect(b.body.generatedAt).toBe(a.body.generatedAt);
    const c = await http.get('/api/v1/intel/ai/daily-brief?force=1').expect(200);
    expect(c.body.text).toContain('2 sipariş');
  });

  it('token olmadan kapalı', async () => {
    await request(server).get('/api/v1/intel/ai/daily-brief').expect(401);
  });
});
