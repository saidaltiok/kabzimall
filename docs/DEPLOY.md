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
NODE_ENV=production                               # ŞART: Swagger kapanır, CORS kısıtlanır,
                                                  # JWT_SECRET zorunlu olur, OTP devCode sızmaz
DATABASE_URL="postgresql://KULLANICI:PAROLA@HOST:5432/kabzimall?schema=public"
PORT=3001
JWT_SECRET="<64+ karakter rastgele üret>"        # ÜRETİMDE MUTLAKA DEĞİŞTİR
CUSTOMER_JWT_SECRET="<ayrı rastgele değer>"       # müşteri oturumları (boşsa türetilir)
AUTH_SEED_EMAIL="admin@ALANADIN.com"
AUTH_SEED_PASSWORD="<güçlü parola>"               # ilk admin; sonra panelden değiştir

# CORS — panel + vitrin adresleri (virgülle). Prod'da BOŞSA tarayıcıdan erişim ÇALIŞMAZ.
CORS_ORIGINS="https://ALANADIN.com,https://panel.ALANADIN.com"

# E-posta (sipariş bildirimleri + müşteri OTP girişi). BOŞ bırakılırsa LOG MODU:
# bildirimler gönderilmez, e-posta ile giriş prod'da OTOMATİK KAPANIR (guest akışı sürer).
SMTP_HOST="smtp.SAGLAYICI.com"
SMTP_PORT=587
SMTP_USER="..."
SMTP_PASS="..."
MAIL_FROM="KabzıMall <no-reply@ALANADIN.com>"
```
- [ ] `NODE_ENV=production` set edildi (PM2/systemd/container env'inde de).
- [ ] `JWT_SECRET` güçlü ve benzersiz (ör. `openssl rand -base64 48`). Varsayılan `dev-secret-*` **kalmasın**.
- [ ] `AUTH_SEED_PASSWORD` güçlü. İlk açılışta admin kullanıcı bu değerlerle **otomatik oluşturulur** (`auth.service.ts onModuleInit`).
- [ ] `DATABASE_URL` yönetilen/prod veritabanını gösteriyor; parola güçlü.
- [ ] `.env` sunucuya güvenli aktarıldı (repoya, arşive, log'a girmedi).

### apps/web/.env.local ve apps/admin/.env.local
```
NEXT_PUBLIC_API_BASE="https://api.ALANADIN.com/api/v1"
# yalnız apps/web: sitemap/OG mutlak URL tabanı
NEXT_PUBLIC_SITE_URL="https://ALANADIN.com"
```
- [ ] Her iki frontend de prod API URL'ini gösteriyor (varsayılan `localhost:3001` DEĞİL).
- [ ] `NEXT_PUBLIC_*` **build sırasında** gömülür → değişince yeniden build gerekir.

---

## 2. Veritabanı
- [ ] Prod Postgres 16 hazır (PostGIS eklentisi ileride harita için; şimdilik şart değil).
- [ ] Şema uygula: `cd apps/api && npx prisma migrate deploy` (üretimde **`migrate dev` KULLANMA**).
- [ ] İlk içerik: `npm run db:seed` (kategoriler + örnek ürünler + sepet). Gerçek kataloğu panelden gir.

### 2a. Günlük yedekleme (veri kaybına karşı güvenlik ağı)
`apps/api` içinde: `npm run db:backup` → `apps/api/backups/kabzimall-YYYY-MM-DD.dump`
(sıkıştırılmış custom-format), son **14 gün** tutulur (eskiler silinir).

- [ ] **Günlük otomatik çalıştır** (OS zamanlayıcı):
  - **Windows (Görev Zamanlayıcı):** her gün 23:30 → `cmd /c "cd C:\...\apps\api && npm run db:backup"`.
  - **Linux (cron):** `30 23 * * *  cd /opt/kabzimall/apps/api && npm run db:backup`.
- [ ] **Buluta (Drive) senkron — sorun anında geri çekmek için:** `rclone` kurup bir remote
  tanımlayın (`rclone config` → Google Drive), sonra `.env`'e `BACKUP_RCLONE_REMOTE="gdrive:kabzimall-yedek"`
  ekleyin. Betik yedeği otomatik oraya yükler (uzakta da 14 günden eskiyi temizler).
  *rclone/remote yoksa yedek yalnız yerelde kalır — yine de çalışır.*
- [ ] **Geri yükleme (felaket kurtarma):** `docker exec -i kabzimall-db pg_restore -U kabzimall
  --clean --if-exists -d kabzimall < backups/kabzimall-GÜN.dump` → ardından `npx prisma migrate deploy`.
- Ayarlanabilir env: `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `BACKUP_DOCKER_CONTAINER`
  (yönetilen Postgres'te boş bırakın → `DATABASE_URL` ile doğrudan `pg_dump`).
- [ ] `prisma generate` build adımında çalışır (`postinstall`).

---

## 3. Güvenlik (koda yerleşik — NODE_ENV=production ile aktifleşir)
- [x] **CORS**: prod'da yalnız `CORS_ORIGINS` env'indeki adresler (main.ts). Dev'de serbest.
- [x] **Swagger** `/api/docs` prod'da kapalı; **helmet** güvenlik başlıkları prod'da açık.
- [x] **OTP koruması**: SMTP yapılandırılmadan prod'da e-posta girişi kapalı (devCode sızmaz).
- [x] **Vitrin yanıtı temiz**: müşteri uçları iç alanları döndürmez (maliyet snapshot'ı,
      personel e-postaları, 📌 dahili notlar — `sanitizeForCustomer`).
- [x] **IP oran sınırı** (bellek içi): OTP 10/15dk · sipariş sorgulama 15/15dk ·
      kupon kontrolü 30/15dk · sipariş oluşturma 10/saat. Kalıcı/Redis versiyonu lansman sonrası.
- [x] **Kasa uçları** yalnız ADMIN/OPERATION okur (para verisi).
- [x] **Health** `/api/v1/health` DB'ye dokunur — kopukta 503 (izleme buna bakmalı).
- [ ] Firestore/AdMob **bu projeye ait değil** (o `world-cup-app`); karıştırma.
- [ ] Panel yalnız güçlü parolalı personel; roller: ADMIN/PRICE_MANAGER/OPERATION/PACKER/COURIER/SUPPORT/VIEWER.
      Not: panel OKUMA uçları tüm personel rollerine açıktır (VIEWER'ın varlık amacı); kasa istisna.
- [ ] HTTPS zorunlu (reverse proxy / platform TLS). API ve frontendler TLS arkasında.
- [ ] Body limit 8mb ayarlı (data URL görseller için) — `main.ts`. Aşırı büyük görsel yüklenmesin.
- Bilinçli kabuller: sipariş takip linki UUID iledir (kargo-takip deseni — linki paylaşan
  sipariş özetini paylaşmış olur); slot doluluk sayısı vitrine açıktır (aciliyet rozeti).

---

## 4. Build & çalıştırma (sıra)
```sh
# 1) Bağımlılıklar (repo kökünde workspace ise kökte, değilse her app'te)
npm install

# 2) API (NODE_ENV=production env'de set olmalı!)
cd apps/api
npx prisma migrate deploy
npm run build
NODE_ENV=production node dist/apps/api/src/main.js   # PM2/systemd/container ile servis et

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
- [ ] `npm test` (apps/api) yeşil (139 e2e). CI kurulu: `.github/workflows/ci.yml` — her push/PR'da fiyat motoru + API e2e (PostGIS servisiyle) + web/admin build koşar.

---

## 5b. Otomatik veri toplama (YERLEŞİK cron'lar — API süreci 7/24 çalışmalı)

API süreci içinde @nestjs/schedule cron'ları çalışır — PM2/systemd ile SÜREKLİ açık tutun:
- **10:00** — rakip senkronu: resmî marketfiyati (A101/BİM/ŞOK/Migros/Carrefour/Tarım Kredi)
  + SSR online manavlar (sebzemeyvedunyasi, tazedukkan). Manuel: panel → Piyasa Verisi → Rakip → "Şimdi güncelle".
- **11:00/13:00/15:00** — İBB hal fiyatları (günde bir başarı yeter; mükerrer korumalı).

### İBB kaynak notları
- Kaynak: `tarim.ibb.istanbul` günlük hal fiyatları (Avrupa=HalTurId 2, doğrulandı; Anadolu=1 deneysel).
  Panel → Piyasa Verisi → Hal → "İBB'den çek / Tümünü içeri al" ile eksik ürünleri oluşturur + fiyat yazar.
- İBB günlük fiyatı **gündüz yayında**, akşam servis boşalıyor — yerleşik cron saatleri buna göre seçildi.
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
| Müşteri OTP — e-posta ile KURULU; SMS istenirse | SMS gateway (Netgsm vb.) |
| Harita poligon hizmet bölgesi + adres doğrulama | PostGIS + harita sağlayıcı |
| Tarayıcı-destekli ek rakipler (Getir/Trendyol/Hepsiexpress) | yarı-otomatik; hukuki not: sahip riski üstlendi |
| E-fatura | e-fatura entegratörü |
| Görsel object storage + OCR | S3 uyumlu depolama |
| Çok-kiracılık (RLS) | Postgres RLS politikaları |

Ürün görselleri `apps/web/public/urunler/` altında repo içinde (45 dosya, ~6MB; lisans kökeni `_kaynaklar.json`, CC BY atıfları web /kaynaklar sayfasında). Web deploy'uyla birlikte gider; ileride object storage'a taşınabilir (`imageUrl` sözleşmesi değişmez).

---

## 7. Hızlı geri alma (rollback)
- [ ] Bir önceki commit'e dön: `git revert` / önceki imaj.
- [ ] Migration geri alma: additive migration'lar güvenli; veri-kaybı migration'ları öncesi **yedek** şart.
- [ ] `.env` ve DB yedeği el altında.
