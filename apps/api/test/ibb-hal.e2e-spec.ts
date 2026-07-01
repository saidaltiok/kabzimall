import { INestApplication } from '@nestjs/common';
import { createTestApp, authed, resetDb } from './test-app';
import { parseIbbTable, slugifyTr } from '../src/intel/hal/ibb-hal.service';

const SAMPLE = `<table border="1" class="tableClass">
<tr><th>Urun Adı</th><th>Birim</th><th>En Düşük Fiyat</th><th>En Yüksek Fiyat</th></tr>
<tr><td>Bakla</td><td>Kilogram</td><td>50,00<span style="font-size:10px"> TL</span></td><td>60,00<span> TL</span></td></tr>
<tr><td>Çilek</td><td>Kilogram</td><td>100,00<span> TL</span></td><td>120,00<span> TL</span></td></tr>
<tr><td>Salatalık</td><td>Kilogram</td><td>18,50<span> TL</span></td><td>21,50<span> TL</span></td></tr>
</table>`;

describe('İBB hal — parser (saf) + eşleme uçları', () => {
  it('parseIbbTable: başlık atlanır, düşük/yüksek/ortalama kuruşa çevrilir', () => {
    const rows = parseIbbTable(SAMPLE);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sourceName: 'Bakla', unit: 'Kilogram', low: 5000, high: 6000, price: 5500 });
    expect(rows[1]).toMatchObject({ sourceName: 'Çilek', low: 10000, high: 12000, price: 11000 });
    expect(rows[2].price).toBe(2000); // (1850+2150)/2
  });

  it('slugifyTr: Türkçe karakterler ascii slug olur', () => {
    expect(slugifyTr('Çilek')).toBe('cilek');
    expect(slugifyTr('Salatalık')).toBe('salatalik');
    expect(slugifyTr('Domates (Sera)')).toBe('domates-sera');
    expect(slugifyTr('Muz')).toBe('muz');
  });

  describe('eşleme uçları', () => {
    let app: INestApplication;
    let http: ReturnType<typeof authed>;

    beforeAll(async () => {
      app = await createTestApp();
      await resetDb(app);
      http = authed(app);
    });
    afterAll(async () => { await app.close(); });

    it('eşleme upsert + listele; VIEWER yazamaz (403)', async () => {
      await http.put('/api/v1/intel/hal/ibb/mappings').send({ sourceName: 'Çilek', productSlug: 'cilek' }).expect(200);
      // idempotent güncelle
      await http.put('/api/v1/intel/hal/ibb/mappings').send({ sourceName: 'Çilek', productSlug: 'cilek-yerli' }).expect(200);
      const list = await http.get('/api/v1/intel/hal/ibb/mappings').expect(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].productSlug).toBe('cilek-yerli');

      await authed(app, 'VIEWER').put('/api/v1/intel/hal/ibb/mappings').send({ sourceName: 'X', productSlug: 'x' }).expect(403);

      await http.delete(`/api/v1/intel/hal/ibb/mappings/${list.body.data[0].id}`).expect(200);
      expect((await http.get('/api/v1/intel/hal/ibb/mappings')).body.meta.total).toBe(0);
    });

    it('İBB içe aktarım: VIEWER yetkisiz (403, ağa çıkmadan reddedilir)', async () => {
      await authed(app, 'VIEWER').post('/api/v1/intel/hal/ibb/import').send({ date: '2026-07-01' }).expect(403);
    });

    it('ingest: dışarıdan gelen satırlar → eksik ürünler oluşur + tarih damgalı hal fiyatı + eşleme', async () => {
      const rows = [
        { sourceName: 'Domates', unit: 'Kilogram', low: 3000, high: 4000, price: 3500 },
        { sourceName: 'Taze Fasulye', unit: 'Kilogram', low: 8000, high: 10000, price: 9000 },
      ];
      const r = await http.post('/api/v1/intel/hal/ibb/ingest').send({ date: '2026-07-05', rows }).expect(201);
      expect(r.body.priced).toBe(2);
      expect(r.body.created).toBe(2); // domates + taze-fasulye (resetDb sonrası katalog boş)

      // katalogda oluştu (yayın dışı)
      const cat = await http.get('/api/v1/catalog/products?search=fasulye').expect(200);
      const tf = cat.body.data.find((p: { slug: string }) => p.slug === 'taze-fasulye');
      expect(tf).toBeTruthy();
      expect(tf.isActive).toBe(false);

      // hal ızgarasında tarih damgalı fiyat
      const grid = await http.get('/api/v1/intel/hal?date=2026-07-05').expect(200);
      const dom = grid.body.data.find((g: { productId: string }) => g.productId === 'domates');
      expect(dom.dailyAverage).toBe(3500);

      // eşleme kalıcılaştı → ikinci ingest yeni ürün oluşturmaz
      const again = await http.post('/api/v1/intel/hal/ibb/ingest').send({ date: '2026-07-06', rows }).expect(201);
      expect(again.body.created).toBe(0); // eşleme kalıcı → yeni ürün yok
      expect(again.body.priced).toBe(2);

      // VIEWER yazamaz
      await authed(app, 'VIEWER').post('/api/v1/intel/hal/ibb/ingest').send({ date: '2026-07-05', rows }).expect(403);
    });
  });
});
