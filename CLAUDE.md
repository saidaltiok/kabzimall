# CLAUDE.md — KabzıMall

Bu dosya, bu repoda **Claude Code** ile çalışırken projeye anında bağlam sağlar.
Yeni bir oturumda önce bunu, sonra `apps/api/README.md` ve
`KabziMall_Teknik_Temel_API.pdf` (Bölüm 3 veri modeli, Bölüm 5 API) okunur.

## Proje nedir

**KabzıMall** — meyve-sebze odaklı online manav + teslimat. İki ürün, tek çekirdek:

- **KabzıMall Market** — müşteri mobil uygulaması + web (sipariş/teslimat).
- **KabzıMall Intelligence** — hal + rakip fiyatı + maliyet → gerçek marj → fiyat
  öneren yönetim paneli (fiyat zekâsı / karar destek).

Konumlandırma: (a) içeride veriyle fiyat/marj yönetimi, (b) dışarıda kaliteli ürünü
güvenle teslim.

## Mimari

Monorepo (Teknik doküman Bölüm 2.1):

```
/apps
  /mobile   React Native (müşteri)        — henüz yok
  /web      Next.js (müşteri sitesi)      — henüz yok
  /admin    Next.js (panel)               — VAR (6 ekran, prototip tasarımı)
  /api      NestJS backend                — VAR (Intelligence API tam)
/packages
  /pricing  FİYAT MOTORU — tek kaynak     — VAR (test edilmiş)
  /types, /api-client, /ui, /i18n, /config — henüz yok
```

Stack: NestJS + TypeScript + PostgreSQL + Redis (backend), Next.js (web/admin),
React Native (mobil).

### KRİTİK KURAL — tek kaynak
Fiyat ve marj hesaplamaları **yalnızca `packages/pricing`** içinde tanımlanır.
Mobil/web/admin/backend hepsi aynı fonksiyonu çağırır. Formül asla kopyalanmaz.
`apps/api` bunu `src/pricing-engine.ts` köprüsüyle re-export edip kullanır.

## Para birimi ve iş kuralları (ezberlenecek)

- **Para:** her yerde **integer kuruş** (3490 = 34,90 ₺). Float yok.
- **Fire:** maliyete **TOPLANMAZ, BÖLÜNÜR.** `fireCost = halAvg / (1 - fireRate)`.
  %20 fire → maliyet +%25 (24 değil 25). En kritik formül.
- **directCost** = fireCost + labor + packaging + fuel + coldStorage + amortization.
- **netMargin(S)** = (S − directCost − S×commissionRate) / S (komisyon satıştan düşülür).
- **priceForMargin(m)** = directCost / (1 − m − commissionRate).
- **psych** yuvarlama: en yakın liraya yuvarla, 10 kuruş düş (…,90).
- **Hal fiyatı günde 1 kez** (belediye yayını). Rakip günde 1–2.
- **resolvePrice**: rakip yoksa hata yerine fallback zinciri
  (COMP_AVG → MARGIN → HAL_MARKUP → FLOOR). "Her ihtimali kapsar."
- **Maliyet:** ürün-bazlı (ambalaj) vs havuz/dağıtımlı (işçilik, yakıt → hacme bölünür).
- **Tartı mutabakatı:** hal tartısı ±500 g; mağazada yeniden tartılınca efektif kg maliyeti.

## Şu an ne var (durum)

- `packages/pricing`: tam ve **22 testi geçen** saf fiyat motoru. Fonksiyonlar:
  `fireCost, directCost, netMargin, priceForMargin, psych, suggestPrice,
  resolvePrice, reconcileHalPurchase, weightPrecisionRiskPct`.
- `apps/api`: çalışan **NestJS iskeleti**, **PostgreSQL kalıcı** (Prisma + PostGIS,
  Docker). Tüm Intelligence verisi `tenant_id` ile (şimdilik sabit DEV tenant;
  auth gelince token'dan). Uçlar:
  - `POST /api/v1/intel/price/resolve` — hiyerarşik fiyat çözümü.
  - `POST /api/v1/intel/price/suggest` — tek strateji ile öneri (fallback yok).
  - `POST /api/v1/intel/price/suggest-product` · `.../resolve-product` — sadece
    `productId` ile öneri; maliyet + günlük hal ort. + rakipler DB'den toplanır.
  - `POST /api/v1/intel/price/apply` — `base_price` yayınla + `price_history` (Bölüm 6.3).
  - `GET  /api/v1/intel/price/history` — uygulanan fiyat geçmişi (en yeni→eski).
  - `POST /api/v1/intel/hal/entries` · `POST .../hal/bulk` · `GET .../hal?date=` —
    günlük hal fiyatı (append-only) + ürün×gün ızgarası + günlük ortalama.
  - `POST|GET /api/v1/intel/competitor-groups` · `.../competitors` ·
    `POST .../competitor-prices/entries` · `GET .../competitor-prices?productId=` —
    rakip tanımları + fiyat (append-only) + min/max/avg/median.
  - `PUT|GET /api/v1/intel/cost-components` · `GET .../cost/:productId?halAvg=` —
    maliyet bileşenleri (GLOBAL/PRODUCT) + etkin maliyet & directCost kırılımı.
  - `GET /api/v1/intel/dashboard?date=` — KPI'lar (fiyatlı ürün, ort. marj,
    zararına/düşük marj sayısı) + riskli ürünler (bayraklı) + son fiyat değişiklikleri.
  - `GET /api/v1/intel/products?date=` — tüm fiyatlı ürünler metrikleriyle (Ürünler & Marj).
  - `POST /api/v1/intel/price/bulk-apply` — çok ürüne strateji uygula; varsayılan
    önizleme, `commit:true` ile base_price + price_history yazılır.
  - `POST|GET /api/v1/intel/hal-purchases` — hal alımı + ±500 g mutabakatı.
  - `POST|GET /api/v1/intel/cost-pool` — havuz maliyeti → kg başına tahsis + directCost önizleme.
  - `GET /api/v1/health`.

Doğrulandı: rakipsiz Domates referans vakası → fiyat 3590, net marj ≈%29,
directCost 2440 (Teknik doküman Bölüm 4.3 ile birebir).

## Komutlar

```bash
# Fiyat motoru testleri
cd packages/pricing && npm install && npm test      # 22/22 geçmeli

# Veritabanı (repo kökünden) — PostGIS'li Postgres
docker compose up -d                                 # DB ayağa kalkar (5432)

# API
cd apps/api && npm install                           # postinstall: prisma generate
cp .env.example .env                                 # ilk kurulumda
npx prisma migrate dev                               # şemayı uygula (ilk kez/şema değişince)
npm run build && npm start                           # http://localhost:3001/api/v1
# geliştirme: npm run start:dev
npm test                                             # Jest e2e (DB açık olmalı)
# Tarayıcıdan test: http://localhost:3001/api/docs (Swagger)
```

> Not: `apps/api` derlemesi `packages/pricing`'i birlikte derler (tsconfig include +
> relative import). Çıktı: `dist/apps/api/src/main.js`.

## Konvansiyonlar

- TypeScript strict; DTO doğrulama `class-validator` + global `ValidationPipe`
  (whitelist + transform). Geçersiz girdi → 400.
- API taban yol `/api/v1`; çok-kiracılık `tenant_id` (şimdilik `common/tenant.ts`
  DEV sabiti; auth gelince token'dan, sonra RLS).
- DB: **Prisma** (`apps/api/prisma/schema.prisma`). UUID PK, `created_at/updated_at`,
  para alanları integer kuruş, append-only `price_history`. Şema değişince
  `npx prisma migrate dev`. Fiyat/maliyet türetimi DB'de saklanmaz — okumada
  `packages/pricing` ile hesaplanır (tek kaynak korunur).

## Sıradaki işler (öncelik sırası)

1. ✅ **Fiyat döngüsü tamamlandı:** `POST /intel/price/suggest` (tek strateji),
   `POST /intel/price/apply` (`base_price` + `price_history`), `GET /intel/price/history`.
   Bellek içi `ProductsStore` / `PriceHistoryStore` ile (iskelet).
2. ✅ **PostgreSQL kalıcı katman kuruldu:** Prisma + PostGIS (Docker). `Map` store'lar
   gerçek tablolarla değişti (`products`, `price_history`, `hal_purchases`,
   `cost_pool_entries`); `tenant_id` (DEV sabiti). **RLS hâlâ açık** — auth ile gelecek.
3. ✅ **Intelligence API yüzeyi (Bölüm 5.5) büyük ölçüde tamam:** hal (günlük +
   ızgara), rakipler (grup/rakip/fiyat + min/max/avg/median), maliyet bileşenleri
   + `cost/:productId`, `suggest-product`/`resolve-product` (productId ile öneri),
   `bulk-apply` (önizlemeli toplu), `dashboard` (KPI + riskli ürünler).
4. ✅ **Test altyapısı:** `apps/api` Jest + supertest e2e (52 test). **Swagger** `/api/docs`.
5. ✅ **Auth & roller kuruldu:** JWT (stateless) + global JwtAuthGuard/RolesGuard.
   `POST /auth/login` → token; `/intel/*` giriş ister; apply/bulk-apply/cost-components
   PUT → `@Roles(ADMIN, PRICE_MANAGER)`; `changedBy` token'dan. İlk açılışta admin seed
   (`admin@kabzimall.local` / `kabzimall123` — .env AUTH_SEED_*). Panelde giriş ekranı.
   **Kalan:** gerçek per-request `tenant_id` çözümü (şu an DEV sabiti) + Postgres RLS.
6. ✅ **Admin panel (apps/admin):** 6 ekran + giriş, prototip tasarımı.
7. Sonra Market tarafı (katalog, sepet, sipariş, tartılı pre-auth→capture).

## Açık kararlar (kod dışı)

Logo seçimi (11 konsept), ödeme sağlayıcı (iyzico/PayTR — pre-auth+partial capture),
hal otomatik kaynağı (İBB), rakip otomatik toplama (hukuki), harita (PostGIS),
push (FCM/APNs).
