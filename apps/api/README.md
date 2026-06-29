# KabzıMall — Intelligence API (NestJS iskeleti)

Fiyat zekâsı backend'inin ilk kesimi. **Tüm fiyat/maliyet mantığı
`packages/pricing`'ten gelir** (tek kaynak); bu uygulama yalnızca girdiyi
doğrular, motoru çağırır ve HTTP yüzeyini sunar. Veri **PostgreSQL**'de
(Prisma + PostGIS) kalıcıdır; türetilmiş değerler (marj, mutabakat, tahsis)
DB'de saklanmaz, okuma anında motorla hesaplanır.

## Çalıştırma

```bash
# 1) Veritabanı (repo kökünden) — PostGIS'li Postgres, port 5432
docker compose up -d

# 2) API
cd apps/api
cp .env.example .env       # DATABASE_URL + PORT
npm install                # postinstall: prisma generate
npx prisma migrate dev     # şemayı uygula (ilk kez / şema değişince)
npm run build              # tsc → dist/  (packages/pricing ile birlikte derlenir)
npm start                  # http://localhost:3001/api/v1
# veya geliştirme:
npm run start:dev
```

> Not: `npm start`, `node dist/apps/api/src/main.js` çalıştırır. `.env` dotenv ile
> yüklenir. Port `PORT` ile değişir (varsayılan 3001). Taban yol: `/api/v1`.
> Şema: `prisma/schema.prisma`; `npm run prisma:studio` ile veriyi görsel inceleyebilirsiniz.

## API konsolu (Swagger) — tarayıcıdan test

Sunucu açıkken **http://localhost:3001/api/docs** adresini açın. Tüm uçlar
gruplu listelenir; her ucu **"Try it out" → "Execute"** ile tarayıcıdan
deneyebilirsiniz (curl gerekmez). Ana POST/PUT uçlarında **hazır örnek gövde**
gelir. Önerilen akış: maliyet (`PUT /cost-components`) → hal (`POST /hal/entries`)
→ rakip (gruplar/rakipler/fiyat) → **`POST /price/suggest-product`**.

## Uçlar (bu kesim — Devam Rehberi Bölüm 8)

> **Kimlik:** `/intel/*` uçları JWT ister (`Authorization: Bearer <token>`).
> `POST /auth/login` ile token alın. İlk açılışta admin seed edilir:
> `admin@kabzimall.local` / `kabzimall123` (`.env` → `AUTH_SEED_*`). Swagger'da
> sağ üstteki **Authorize** ile token girip tüm uçları deneyebilirsiniz.

| Metot | Yol | Açıklama |
|---|---|---|
| POST | `/auth/login` | E-posta+parola → `{ accessToken, user }` (public) |
| GET  | `/auth/me` | Token'daki kullanıcı |
| GET  | `/health` | Sağlık kontrolü (public) |
| POST | `/intel/price/resolve` | Hiyerarşik fiyat çözümü (`resolvePrice`) — rakip yoksa fallback zinciri |
| POST | `/intel/price/suggest` | Tek strateji ile öneri (`suggestPrice`) — fallback yok |
| POST | `/intel/price/suggest-product` | **Sadece `productId`** ile öneri (maliyet+hal+rakip DB'den) |
| POST | `/intel/price/resolve-product` | `productId` ile hiyerarşik çözüm (girdiler DB'den) |
| POST | `/intel/price/apply` | Fiyatı `base_price` olarak yayınla + `price_history`'e yaz |
| POST | `/intel/price/bulk-apply` | Çok ürüne strateji uygula — önizleme (commit ile yaz) |
| GET  | `/intel/price/history` `?productId=` | Uygulanan fiyat geçmişi (append-only) |
| POST | `/intel/hal/entries` | Günlük hal fiyatı ekle (append-only) |
| POST | `/intel/hal/bulk` | Saha Modu: çok ürünlü toplu hal kaydı |
| GET  | `/intel/hal` `?date=` | Ürün × gün ızgarası + günlük ortalama |
| POST/GET | `/intel/competitor-groups` | Rakip grubu oluştur / listele |
| POST/GET | `/intel/competitors` | Rakip oluştur (grup FK) / listele |
| POST | `/intel/competitor-prices/entries` | Rakip fiyatı ekle (append-only) |
| GET  | `/intel/competitor-prices` `?productId=&date=` | Fiyatlar + min/max/avg/median (rakip başına en güncel) |
| PUT/GET | `/intel/cost-components` | Maliyet bileşeni upsert (scope: GLOBAL/PRODUCT) / listele |
| GET  | `/intel/cost/:productId` `?halAvg=` | Etkin maliyet + `directCost` kırılımı |
| GET  | `/intel/dashboard` `?date=` | KPI + riskli ürünler + son fiyat değişiklikleri |
| GET  | `/intel/products` `?date=` | Tüm fiyatlı ürünler: hal/maliyet/marj/endeks + bayraklar |
| GET/POST | `/catalog/categories` | Kategori listele / oluştur (yazma: ADMIN\|OPERATION) |
| GET | `/catalog/products` `?search=&categoryId=&active=` | Ürün listele |
| POST/PATCH/DELETE | `/catalog/products` `[/:id]` | Ürün oluştur/güncelle/sil (yazma: ADMIN\|OPERATION) |
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

**productId ile öneri (maliyet + hal + rakip DB'den toplanır):**

```bash
# Önce veri: cost-components (GLOBAL) + hal + rakip girilmiş olmalı (yukarıdaki örnekler).
curl -X POST http://localhost:3001/api/v1/intel/price/suggest-product \
  -H 'Content-Type: application/json' \
  -d '{"productId":"domates","strategy":"MARGIN","params":{"targetMargin":0.30}}'
# → {"price":3590,"competitionIndex":82,"inputs":{"halAvg":1870,"directCost":2440,"competitorCount":1,"competitorAvg":4400},...}
```

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

**Günlük hal fiyatı gir → ızgara + günlük ortalama:**

```bash
# Aynı gün iki giriş (append-only)
curl -X POST http://localhost:3001/api/v1/intel/hal/entries -H 'Content-Type: application/json' \
  -d '{"productId":"domates","price":1850,"date":"2026-06-29","source":"MANUAL"}'
curl -X POST http://localhost:3001/api/v1/intel/hal/entries -H 'Content-Type: application/json' \
  -d '{"productId":"domates","price":1890,"date":"2026-06-29"}'

# Saha Modu — toplu
curl -X POST http://localhost:3001/api/v1/intel/hal/bulk -H 'Content-Type: application/json' \
  -d '{"date":"2026-06-29","entries":[{"productId":"salatalik","price":1200},{"productId":"biber","price":2400}]}'

# Izgara (ürün başına günlük ortalama)
curl "http://localhost:3001/api/v1/intel/hal?date=2026-06-29"
# → {"date":"2026-06-29","data":[{"productId":"domates","count":2,"dailyAverage":1870,"entries":[...]}, ...]}
```

**Rakip fiyatları (grup → rakip → fiyat → aggregate):**

```bash
G=$(curl -s -X POST http://localhost:3001/api/v1/intel/competitor-groups -H 'Content-Type: application/json' -d '{"name":"Orta"}' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
C=$(curl -s -X POST http://localhost:3001/api/v1/intel/competitors -H 'Content-Type: application/json' -d "{\"name\":\"Market A\",\"groupId\":\"$G\"}" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -X POST http://localhost:3001/api/v1/intel/competitor-prices/entries -H 'Content-Type: application/json' -d "{\"productId\":\"domates\",\"competitorId\":\"$C\",\"price\":4200}"
curl "http://localhost:3001/api/v1/intel/competitor-prices?productId=domates"
# → {"count":1,"min":4200,"max":4200,"average":4200,"median":4200,"entries":[...]}
```

**Maliyet bileşeni → ürün maliyeti (directCost):**

```bash
# Genel (GLOBAL) maliyet bileşenleri
curl -X PUT http://localhost:3001/api/v1/intel/cost-components -H 'Content-Type: application/json' \
  -d '{"scope":"GLOBAL","fireRate":0.15,"labor":120,"packaging":70,"fuel":50,"commissionRate":0.03}'

# Ürün maliyeti — halAvg verilmezse ürünün en güncel günlük hal ortalaması kullanılır
curl "http://localhost:3001/api/v1/intel/cost/domates?halAvg=1870"
# → {"source":"GLOBAL","halAvg":1870,"directCost":2440,"breakdown":{...}}
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

## Testler

```bash
npm test          # Jest e2e (test/*.e2e-spec.ts) — 18 test, tüm uçlar
```

Her test, üretimdeki `main.ts` ile **aynı** yapılandırmada (global prefix +
`ValidationPipe`) tam Nest uygulamasını ayağa kaldırıp supertest ile HTTP
yüzeyini doğrular. **DB açık olmalı** (`docker compose up -d` + migrate); her
suite başında Intelligence tabloları temizlenir (izolasyon). Fiyat formülleri
ayrıca `packages/pricing`'te node:test ile test edilir; buradaki testler API
davranışına (doğrulama, yanıt şekli, durum kodu) odaklanır. Test dosyaları
`tsconfig.build.json`'da hariç → prod derlemeye sızmaz.

## Mimari notlar

- `src/pricing-engine.ts` tek köprü: `packages/pricing`'i re-export eder.
  Formüller **asla** buraya kopyalanmaz (Teknik doküman Bölüm 2.1 kritik kuralı).
- `ValidationPipe` (whitelist + transform) ile gövdeler doğrulanır; geçersiz
  girdi (ör. `fireRate ≥ 1`) `400` döner.
- Kalıcılık **Prisma** ile (`PrismaService`, global `PrismaModule`). Tablolar:
  `products`, `price_history`, `hal_purchases`, `cost_pool_entries`. Her tabloda
  `tenant_id` (şimdilik `common/tenant.ts` DEV sabiti).

## Sıradaki adımlar

- Auth/guard'lar (rol: fiyat yöneticisi+ — Teknik doküman Bölüm 7); `apply`
  sonrası `changedBy` token'dan gelecek + Postgres **RLS** satır izolasyonu.
- `/intel/price/bulk-apply` (toplu güncelleme + önizleme) ve `/intel/dashboard`
  gibi analiz uçları.
