# KabzıMall — Intelligence API (NestJS iskeleti)

Fiyat zekâsı backend'inin ilk kesimi. **Tüm fiyat/maliyet mantığı
`packages/pricing`'ten gelir** (tek kaynak); bu uygulama yalnızca girdiyi
doğrular, motoru çağırır ve HTTP yüzeyini sunar. Veri şimdilik **bellek içi**
(in-memory) tutulur — DB yok, hemen çalışır.

## Çalıştırma

```bash
cd apps/api
npm install
npm run build      # tsc → dist/  (packages/pricing ile birlikte derlenir)
npm start          # http://localhost:3001/api/v1
# veya geliştirme:
npm run start:dev
```

> Not: `npm start`, `node dist/apps/api/src/main.js` çalıştırır. Port `PORT`
> ortam değişkeniyle değişir (varsayılan 3001). Taban yol: `/api/v1`.

## Uçlar (bu kesim — Devam Rehberi Bölüm 8)

| Metot | Yol | Açıklama |
|---|---|---|
| GET  | `/health` | Sağlık kontrolü |
| POST | `/intel/price/resolve` | Hiyerarşik fiyat çözümü (`resolvePrice`) — rakip yoksa fallback zinciri |
| POST | `/intel/price/suggest` | Tek strateji ile öneri (`suggestPrice`) — fallback yok |
| POST | `/intel/price/apply` | Fiyatı `base_price` olarak yayınla + `price_history`'e yaz |
| GET  | `/intel/price/history` `?productId=` | Uygulanan fiyat geçmişi (append-only) |
| POST | `/intel/hal-purchases` | Hal alımı + ±500 g tartı mutabakatı (`reconcileHalPurchase`) |
| GET  | `/intel/hal-purchases` `?productId=` | Kayıtlı alımları listele |
| GET  | `/intel/hal-purchases/:id` | Tek alım |
| POST | `/intel/cost-pool` | Havuz/dağıtımlı maliyetleri kg başına tahsis et + `directCost` önizleme |
| GET  | `/intel/cost-pool` `?period=` | Havuz kayıtları |
| GET  | `/intel/cost-pool/:id` | Tek havuz |

## Örnekler

**Fiyat çöz (rakip varsa COMP_AVG, yoksa otomatik fallback):**

```bash
curl -X POST http://localhost:3001/api/v1/intel/price/resolve \
  -H 'Content-Type: application/json' \
  -d '{"cost":{"halAvg":1870,"fireRate":0.15,"labor":120,"packaging":70,"fuel":50,"commissionRate":0.03}}'
# → {"price":3590,"netMargin":0.290,"directCost":2440,"strategy":"MARGIN","usedFallback":true,...}
```

`chain` gönderilmezse motorun varsayılanı kullanılır:
`COMP_AVG → MARGIN → HAL_MARKUP → FLOOR`. İsteğe bağlı `chain` ve `baseParams`
ile zincir tamamen özelleştirilebilir. Tüm para alanları **kuruş** (3590 = 34,90 ₺).

**Tek strateji ile öner → uygula → geçmiş (fiyat döngüsü):**

```bash
# 1) Öner (fallback yok; istenen stratejiyi uygular)
curl -X POST http://localhost:3001/api/v1/intel/price/suggest \
  -H 'Content-Type: application/json' \
  -d '{"productId":"domates","cost":{"halAvg":1870,"fireRate":0.15,"labor":120,"packaging":70,"fuel":50,"commissionRate":0.03},"strategy":"MARGIN","params":{"targetMargin":0.30}}'
# → {"price":3590,"netMargin":0.290,"strategy":"MARGIN","floored":false,...}

# 2) Uygula (base_price yayınla + price_history)
curl -X POST http://localhost:3001/api/v1/intel/price/apply \
  -H 'Content-Type: application/json' \
  -d '{"productId":"domates","price":3590,"strategy":"MARGIN","netMargin":0.29,"reason":"İlk yayın"}'
# → {"product":{"id":"domates","basePrice":3590,...},"history":{"oldPrice":null,"newPrice":3590,...}}

# 3) Geçmiş (en yeni → en eski)
curl "http://localhost:3001/api/v1/intel/price/history?productId=domates"
```

**Hal alım mutabakatı:**

```bash
curl -X POST http://localhost:3001/api/v1/intel/hal-purchases \
  -H 'Content-Type: application/json' \
  -d '{"productId":"domates","recordedKg":50,"actualKg":49.6,"totalPaid":100000}'
# → recordedUnitCost 2000, actualUnitCost 2016, deltaKg -0.4, weightRiskPct 0.01
```

**Maliyet havuzu (işçilik/yakıt → kg başına):**

```bash
curl -X POST http://localhost:3001/api/v1/intel/cost-pool \
  -H 'Content-Type: application/json' \
  -d '{"period":"2026-06","totalLabor":5000000,"totalFuel":2000000,"totalVolumeKg":10000,
       "previewProduct":{"halAvg":1870,"fireRate":0.15,"packaging":70,"commissionRate":0.03}}'
# → laborPerKg 500, fuelPerKg 200, preview.directCost 2970
```

## Mimari notlar

- `src/pricing-engine.ts` tek köprü: `packages/pricing`'i re-export eder.
  Formüller **asla** buraya kopyalanmaz (Teknik doküman Bölüm 2.1 kritik kuralı).
- `ValidationPipe` (whitelist + transform) ile gövdeler doğrulanır; geçersiz
  girdi (ör. `fireRate ≥ 1`) `400` döner.
- Bellek içi store'lar (`Map`) üretimde PostgreSQL tablolarıyla değiştirilecek
  (`hal_price_entries`, `cost_components` vb. — Teknik doküman Bölüm 3.3).

## Sıradaki adımlar

- PostgreSQL + TypeORM/Prisma ile kalıcı katman (tenant_id / RLS); bellek içi
  `ProductsStore` / `PriceHistoryStore` gerçek `products.base_price` ve
  append-only `price_history` tablolarıyla değişecek.
- Auth/guard'lar (rol: fiyat yöneticisi+ — Teknik doküman Bölüm 7); `apply`
  sonrası `changedBy` token'dan gelecek.
- `/intel/price/bulk-apply` (toplu güncelleme + önizleme) ve `/intel/price/suggest`
  için entegrasyon testleri (DoD: uç başına ≥1 test).
