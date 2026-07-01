# KabzıMall — Deploy Hazırlık Kontrol Listesi

> Faz 1 hedefi: **kapıda ödeme (COD)** ile canlıya çıkmak. Ödeme sağlayıcı, SMS/push,
> harita (PostGIS), e-fatura ve müşteri OTP **sonraki faz** — sağlayıcı kararına bağlı.
> Bu belge, elimizdeki yığınla (NestJS + Prisma + Postgres/PostGIS + Next.js) sorunsuz
> canlıya çıkmak için gerekenleri sırayla listeler.

## 0. Mimari özet
| Uygulama | Teknoloji | Port (yerel) | Çalıştırma (prod) |
|---|---|---|---|
| `apps/api` | NestJS + Prisma | 3001 | `npm run build` → `node dist/apps/api/src/main.js` |
| `apps/admin` | Next.js (panel) | 3000 | `npm run build` → `npm run start` |
| `apps/web` | Next.js (vitrin) | 3002 | `npm run build` → `npm run start` |
| Veritabanı | PostgreSQL 16 + PostGIS | 5432 | `docker compose up -d` (ya da yönetilen Postgres) |

Node 22. Fiyat mantığı tek kaynak: `packages/pricing`.

---

## 1. Ortam değişkenleri (secrets)

### apps/api/.env (asla commit edilmez — `.gitignore`'da)
```
DATABASE_URL="postgresql://KULLANICI:PAROLA@HOST:5432/kabzimall?schema=public"
PORT=3001
JWT_SECRET="<64+ karakter rastgele üret>"        # ÜRETİMDE MUTLAKA DEĞİŞTİR
AUTH_SEED_EMAIL="admin@ALANADIN.com"
AUTH_SEED_PASSWORD="<güçlü parola>"               # ilk admin; sonra panelden değiştir
```
- [ ] `JWT_SECRET` güçlü ve benzersiz (ör. `openssl rand -base64 48`). Varsayılan `dev-secret-*` **kalmasın**.
- [ ] `AUTH_SEED_PASSWORD` güçlü. İlk açılışta admin kullanıcı bu değerlerle **otomatik oluşturulur** (`auth.service.ts onModuleInit`).
- [ ] `DATABASE_URL` yönetilen/prod veritabanını gösteriyor; parola güçlü.
- [ ] `.env` sunucuya güvenli aktarıldı (repoya, arşive, log'a girmedi).

### apps/web/.env.local ve apps/admin/.env.local
```
NEXT_PUBLIC_API_BASE="https://api.ALANADIN.com/api/v1"
```
- [ ] Her iki frontend de prod API URL'ini gösteriyor (varsayılan `localhost:3001` DEĞİL).
- [ ] `NEXT_PUBLIC_*` **build sırasında** gömülür → değişince yeniden build gerekir.

---

## 2. Veritabanı
- [ ] Prod Postgres 16 hazır (PostGIS eklentisi ileride harita için; şimdilik şart değil).
- [ ] Şema uygula: `cd apps/api && npx prisma migrate deploy` (üretimde **`migrate dev` KULLANMA**).
- [ ] İlk içerik: `npm run db:seed` (kategoriler + örnek ürünler + sepet). Gerçek kataloğu panelden gir.
- [ ] Yedekleme planı (günlük otomatik snapshot).
- [ ] `prisma generate` build adımında çalışır (`postinstall`).

---

## 3. Güvenlik
- [ ] **CORS**: `apps/api/src/main.ts` şu an `cors: true` (tüm origin'lere açık). Prod'da yalnız
      vitrin + panel origin'lerine kısıtla: `cors: { origin: ['https://ALANADIN.com','https://panel.ALANADIN.com'], credentials: false }`.
- [ ] Firestore/AdMob **bu projeye ait değil** (o `world-cup-app`); karıştırma.
- [ ] Panel yalnız güçlü parolalı personel; roller: ADMIN/PRICE_MANAGER/OPERATION/PACKER/COURIER/SUPPORT/VIEWER.
- [ ] HTTPS zorunlu (reverse proxy / platform TLS). API ve frontendler TLS arkasında.
- [ ] Body limit 8mb ayarlı (data URL görseller için) — `main.ts`. Aşırı büyük görsel yüklenmesin.
- [ ] Rate-limit/oran sınırı (Redis) **ertelendi** — lansman sonrası; şimdilik reverse proxy seviyesinde temel koruma.

---

## 4. Build & çalıştırma (sıra)
```sh
# 1) Bağımlılıklar (repo kökünde workspace ise kökte, değilse her app'te)
npm install

# 2) API
cd apps/api
npx prisma migrate deploy
npm run build
node dist/apps/api/src/main.js        # PM2/systemd/container ile servis et

# 3) Panel
cd apps/admin && npm run build && npm run start   # :3000

# 4) Vitrin
cd apps/web && npm run build && npm run start      # :3002
```
- [ ] API, panel, vitrin birer servis (PM2 / systemd / Docker) olarak kalıcı çalışıyor; çökünce yeniden başlıyor.
- [ ] Reverse proxy (nginx/Caddy): `ALANADIN.com`→vitrin(3002), `panel.ALANADIN.com`→panel(3000), `api.ALANADIN.com`→api(3001).
- Not: `npm run start:dev` (ts-node-dev) ESM sorunundan dolayı kullanılmıyor; **prod build+start** bundan etkilenmez.

---

## 5. Doğrulama (deploy sonrası duman testi)
- [ ] `GET https://api.../api/v1/storefront/products` → 200, ürünler geliyor.
- [ ] Panele giriş (admin e-posta/parola) → Dashboard açılıyor.
- [ ] Vitrinde sepete ekle → ödeme → sipariş oluştu; panel Siparişler'de görünüyor.
- [ ] Sipariş durum akışı (Pano: onay→hazırla→paketle→yola→teslim) çalışıyor.
- [ ] Telefonla sipariş takibi + müşteri iptali çalışıyor.
- [ ] `npm test` (apps/api) yeşil (111 e2e) — CI'da her push'ta koşsun (öneri).

---

## 5b. İBB hal fiyatı otomatik çekimi (kurulu — zamanlama notu)
- Kaynak: `tarim.ibb.istanbul` günlük hal fiyatları (Avrupa=HalTurId 2, doğrulandı; Anadolu=1 deneysel).
  Panel → Hal Fiyatları → "🏛️ İBB'den çek / ⤵ Tümünü içeri al" ile eksik ürünleri oluşturur + fiyat yazar.
- **ÖNEMLİ — zamanlama:** İBB günlük fiyatı **gündüz yayında**, akşam servis boşalıyor (öğlen 59 satır,
  22:24'te 0). İçe aktarımı/scheduler'ı **iş saatinde** çalıştır (öneri: cron ~11:00, market günü).
- Alternatif kaynak `halfiyatlaripublicdata.ibb.gov.tr` (swagger) daha zengin (geçmiş fiyat) ama spec ucu
  tarayıcı-dışı istemcileri resetliyor; gündüz erişilebiliyorsa değerlendirilebilir.
- Rakip fiyatları (Migros/Carrefour web'den okunabiliyor; Getir/Trendyol app-gated): otomatik sunucu
  toplama ToS/anti-bot nedeniyle önerilmez → tarayıcı-destekli/manuel giriş ya da ücretli API.

---

## 6. Sonraki faz (altyapı/sağlayıcı kararı gerektirir — bugün DEĞİL)
| Özellik | Gereken |
|---|---|
| Kart ödeme (pre-auth + partial capture) | iyzico / PayTR |
| SMS/push bildirim (gramaj kesinleşme, durum) | Firebase (FCM/APNs) / SMS gateway |
| Müşteri OTP giriş/hesap | SMS gateway |
| Harita poligon hizmet bölgesi + adres doğrulama | PostGIS + harita sağlayıcı |
| Otomatik hal/rakip fiyat kaynağı | İBB endpoint / hukuki netlik |
| E-fatura | e-fatura entegratörü |
| Görsel object storage + OCR | S3 uyumlu depolama |
| Çok-kiracılık (RLS) | Postgres RLS politikaları |

Şu an görseller data URL olarak DB'de; küçük katalog için yeterli, ileride object storage'a taşınır (`imageUrl` sözleşmesi değişmez).

---

## 7. Hızlı geri alma (rollback)
- [ ] Bir önceki commit'e dön: `git revert` / önceki imaj.
- [ ] Migration geri alma: additive migration'lar güvenli; veri-kaybı migration'ları öncesi **yedek** şart.
- [ ] `.env` ve DB yedeği el altında.
