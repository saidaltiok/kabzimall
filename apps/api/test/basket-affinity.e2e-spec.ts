import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed, resetDb } from './test-app';

describe('İdeal sepet önerisi (birlikte-satın-alma)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const order = (slugs: string[], phone: string) =>
    request(server)
      .post('/api/v1/storefront/orders')
      .send({ items: slugs.map((slug) => ({ slug, qty: 1 })), customer: { name: 'Afinite', phone, address: 'E Mah.' } })
      .expect(201);

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    http = authed(app);
    server = app.getHttpServer();

    for (const slug of ['afn-a', 'afn-b', 'afn-c', 'afn-d']) {
      await http.post('/api/v1/catalog/products').send({ slug, name: slug[0].toUpperCase() + slug.slice(1), saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3000 }).expect(201);
    }
    // afn-a+afn-b 3 kez birlikte (2'sinde afn-c da var); afn-d hep tek
    await order(['afn-a', 'afn-b', 'afn-c'], '05551110101');
    await order(['afn-a', 'afn-b', 'afn-c'], '05551110102');
    await order(['afn-a', 'afn-b'], '05551110103');
    await order(['afn-d'], '05551110104');
  });

  afterAll(async () => {
    await app.close();
  });

  it('en sık birlikte alınan çift ve birliktelik oranı doğru', async () => {
    const res = await http.get('/api/v1/intel/analytics/basket-affinity?days=30').expect(200);
    expect(res.body.ordersAnalyzed).toBe(4);
    const top = res.body.pairs[0];
    expect([top.a.slug, top.b.slug].sort()).toEqual(['afn-a', 'afn-b']);
    expect(top.together).toBe(3);
    expect(top.confidence).toBe(1); // afn-b'in geçtiği 3 siparişin 3'ünde afn-a de var
  });

  it('önerilen sepet en popüler üründen greedy genişler, tek geçen çifte girmez', async () => {
    const res = await http.get('/api/v1/intel/analytics/basket-affinity?days=30').expect(200);
    const slugs = res.body.suggestedBasket.map((s: { slug: string }) => s.slug);
    expect(slugs).toContain('afn-a');
    expect(slugs).toContain('afn-b');
    expect(slugs).toContain('afn-c');
    expect(slugs).not.toContain('afn-d'); // hiçbir şeyle birlikte alınmadı
  });

  it('token olmadan kapalı', async () => {
    await request(server).get('/api/v1/intel/analytics/basket-affinity').expect(401);
  });
});
