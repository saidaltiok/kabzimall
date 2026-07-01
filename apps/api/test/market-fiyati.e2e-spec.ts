import { INestApplication } from '@nestjs/common';
import { createTestApp, authed, resetDb } from './test-app';
import { aggregateProducePrices } from '../src/intel/competitors/market-fiyati.service';

const SAMPLE = [
  { title: 'Yerli Muz 1 Kg', menu_category: 'Meyve ve Sebze', productDepotInfoList: [{ marketAdi: 'migros', price: 79.95 }, { marketAdi: 'a101', price: 74.9 }, { marketAdi: 'getir', price: 120 }] },
  { title: 'İthal Muz 1 Kg', menu_category: 'Meyve ve Sebze', productDepotInfoList: [{ marketAdi: 'migros', price: 119.95 }] },
  { title: 'Muz Cips 100g', menu_category: 'Atıştırmalık', productDepotInfoList: [{ marketAdi: 'bim', price: 30 }] },
];

describe('marketfiyati — aggregate (saf) + uç yetkisi', () => {
  it('aggregateProducePrices: taze eşleşir, market başına en düşük, kuruş; bilinmeyen market atlanır', () => {
    const r = aggregateProducePrices(SAMPLE, 'muz');
    const migros = r.find((x) => x.market === 'migros');
    const a101 = r.find((x) => x.market === 'a101');
    expect(migros).toMatchObject({ competitor: 'Migros', price: 7995 }); // min(7995, 11995)
    expect(a101).toMatchObject({ competitor: 'A101', price: 7490 });
    expect(r.find((x) => x.market === 'getir')).toBeUndefined(); // marketfiyati kapsamı dışı → eşlenmez
    expect(r.some((x) => x.title.includes('Cips'))).toBe(false); // atıştırmalık taze değil → elenir
  });

  describe('uç', () => {
    let app: INestApplication;
    let http: ReturnType<typeof authed>;
    beforeAll(async () => { app = await createTestApp(); await resetDb(app); http = authed(app); });
    afterAll(async () => { await app.close(); });

    it('marketfiyati import: VIEWER yazamaz (403, ağa çıkmadan)', async () => {
      await authed(app, 'VIEWER').post('/api/v1/intel/competitor-prices/marketfiyati/import').send({ productId: 'muz' }).expect(403);
    });

    it('productId zorunlu → 400', async () => {
      await http.post('/api/v1/intel/competitor-prices/marketfiyati/import').send({}).expect(400);
    });
  });
});
