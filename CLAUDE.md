# CLAUDE.md — KabzıMall

Bu dosya, bu repoda **Claude Code** ile çalışırken projeye anında bağlam sağlar.
Derin arka plan için `KabziMall_Teknik_Temel_API.pdf` (veri modeli) ve
`KabziMall_Guncelleme_v1_1.docx` (ürün kararları) hâlâ geçerli referanslardır.

## Proje nedir

**KabzıMall** — meyve-sebze odaklı online manav + teslimat. İki ürün, tek çekirdek:

- **KabzıMall Market** — müşteri web vitrini (mobil ileride).
- **KabzıMall Intelligence** — hal + rakip fiyatı + maliyet → gerçek marj → fiyat
  öneren, her sabah karar veren yönetim paneli.

Konumlandırma: (a) içeride veriyle fiyat/marj yönetimi, (b) dışarıda kaliteli ürünü
güvenle teslim. Ödeme şimdilik yalnız **kapıda** (online ödeme bilinçli ertelendi).

## Mimari

```
/apps
  /web      Next.js müşteri vitrini (:3002)  — vitrin/sepet/ödeme/sipariş takibi,
            OTP girişi, kurumsal+yasal sayfalar, SEO/PWA, gerçek ürün görselleri
  /admin    Next.js yönetim paneli (:3000)   — 9 girişli sidebar (aşağıda)
  /api      NestJS backend (:3001, /api/v1)  — Intelligence + Katalog + Market
/packages
  /pricing  FİYAT MOTORU — tek kaynak (birim testli)
```

Stack: NestJS + TypeScript + PostgreSQL(+PostGIS, Docker `kabzimall-db`) + Prisma,
Next.js 15 (web/admin), para her yerde **integer kuruş**.

### KRİTİK KURAL — tek kaynak
Fiyat/marj hesapları yalnızca `packages/pricing`. `apps/api` bunu
`src/pricing-engine.ts` köprüsüyle re-export eder. Formül asla kopyalanmaz.

### KRİTİK KURAL — maliyet güvenlik ağı
`basePrice`/`discountedPrice` yazan HER yol taban marjı kontrol eder
(rakip yayınlama `publishPopular`, katalog PATCH/POST, sepet oluşturma, fiyat
motoru). Maliyet bilinmiyorsa yazılır ama `costUnknown` işaretlenir. Yeni bir
"fiyat yaz" akışı eklerken bu ağı bağla (bkz. memory: kabzimall-cost-safety-net).

## İş kuralları (ezber)

- **Fire:** maliyete TOPLANMAZ, BÖLÜNÜR. `fireCost = halAvg / (1 - fireRate)`.
- **directCost** = fireCost + labor + packaging + fuel + coldStorage + amortization.
- **netMargin(S)** = (S − directCost − S×komisyon) / S; **priceForMargin** tersidir.
- **psych:** liraya yuvarla, 10 kuruş düş (…,90). Taban fiyat yuvarlaması YUKARI (ceil).
- **resolvePrice** fallback zinciri: COMP_AVG → MARGIN → HAL_MARKUP → FLOOR.
- Tartılı üründe sipariş tutarı tahminidir; paketlemede gerçek gramajla kesinleşir.
- Katalogun gerçek kaynağı **İBB günlük import'udur** (elle toptan liste kurma —
  bkz. memory: kabzimall-ibb-catalog-source). Yöresel Ürünler kategorisi ayrıdır.

## Otomasyon (API ayaktayken cron'lar)

| Cron | Saat (İstanbul) | Ne yapar |
|---|---|---|
| `IbbHalService.dailyAutoImport` | 11:00/13:00/15:00 | İBB hal fiyatları → ürün oluştur + tarih damgalı fiyat (günde bir kez, mükerrer korumalı) |
| `CompetitorSyncService.daily` | 10:00 | marketfiyati (A101/BİM/ŞOK/Migros/Carrefour/Tarım Kredi) + SSR online manavlar (sebzemeyvedunyasi, tazedukkan) |

Manuel tetikler panelde: Piyasa Verisi → "Şimdi güncelle", Hal → "Tümünü içeri al".
Getir/Trendyol/yerel zincirler otomatik DEĞİL (anti-bot/konum kapısı) — elle ya da
ileride tarayıcı-destekli.

## Admin panel (9 giriş, grup içi sekmeler)

- **Günlük İş:** ☀️ Bugün (karar ekranı: veri ışıkları + önerilen fiyat tek tık
  uygula) · 🧺 Piyasa Verisi (Hal|Rakip) · 🎯 Fiyatlandırma (Tek ürün|Toplu yayına
  al|Marj tablosu|Senaryo) · 🧾 Siparişler (Pano|Liste; eksik-ürün tercihi rozeti,
  saat değişikliği Onayla/Reddet) · 🚚 Dağıtım Rotası (NN+2-opt optimize; kurye
  PWA linki `/kurye`)
- **Yönetim:** 🗂️ Ürünler (Katalog|Hazır sepetler) · 📈 Satış Analizi ·
  💸 Maliyet & Kurallar · ⚙️ Ayarlar (Mağaza+iletişim bilgileri|Teslimat bölgeleri)

## Market/müşteri akışları

- Misafir sipariş (kapıda ödeme) + harita pin (uzak-pin teyidi) + eksik ürün
  tercihi (CALL/REMOVE/SUBSTITUTE) + opsiyonel e-posta.
- Sipariş sayfası 30 sn'de bir kendini tazeler; CONFIRMED'da iptal ve teslimat
  saati değişikliği TALEBİ (admin onayıyla kesinleşir, müşteri bilgilendirilir).
- **E-posta:** `MailService` — SMTP env yoksa LOG modu (kod aynı; canlıda yalnız
  SMTP_HOST/PORT/USER/PASS/MAIL_FROM doldurulur). Her gönderim Notification
  (channel EMAIL) olarak da kaydedilir.
- **Müşteri OTP girişi (e-posta):** kod hash'li/5 dk/tek kullanım; token
  `kind:'customer'` — **personel uçlarında kökten reddedilir** (JwtAuthGuard).
  "Siparişlerim" girişliyken sunucudan gelir. Lookup + OTP istekleri rate limitli.
- Web sayfaları: /hakkimizda /iletisim (ayarlardan beslenir) /kvkk /gizlilik
  /mesafeli-satis /iade /kaynaklar (görsel atıfları). SEO: ürün başına meta,
  sitemap, robots; PWA manifest. Görseller `/public/urunler` (yöresel: Shopier
  kaynaklı; taze: CC0/PD + 3 CC BY — atıf /kaynaklar'da, köken _kaynaklar.json).

## Komutlar

```bash
docker compose up -d                      # DB (kabzimall-db)
cd apps/api && npm run build && npm start # API — NOT: start:dev ÇALIŞMIYOR
                                          # (ts-node-dev, packages/pricing ESM'inde takılıyor)
npm --prefix apps/admin run dev           # panel :3000  (admin@kabzimall.local / kabzimall123)
npm --prefix apps/web run dev             # vitrin :3002
```

### Testler (139 e2e + pricing birim)
`npm test` (apps/api) paylaşılan dev DB'yi TRUNCATE eder. Gerçek veri varken:

```bash
MSYS_NO_PATHCONV=1 docker exec kabzimall-db pg_dump -U kabzimall -d kabzimall --format=custom -f /tmp/kabzimall-backup.dump
cd apps/api && npm test
MSYS_NO_PATHCONV=1 docker exec kabzimall-db pg_restore -U kabzimall -d kabzimall --clean --if-exists --no-owner /tmp/kabzimall-backup.dump
```

Şema değişince: API'yi durdur → `npx prisma migrate dev --name x --skip-generate`
→ `npx prisma generate` (API çalışırken generate EPERM verir) → build → start.

## Konvansiyonlar

- TS strict; DTO'lar class-validator (whitelist+transform → fazla alan 400).
- Tenant şimdilik DEV sabiti (`common/tenant.ts`); auth JWT (personel: rol bazlı;
  müşteri: kind:'customer' — asla karışmaz).
- Append-only: price_history, hal/competitor price entries, order status history.
- Seed (`prisma/seed.mjs`) yalnız demo + rakip roster kurar; ürünlerde
  CREATE-ONLY (reseed gerçek fiyatı ezmez).

## Sıradaki işler / açık kararlar

1. **Lansman öncesi:** yasal metinlerde şirket kimliği alanları (işaretli) +
   hukukçu onayı; SMTP anahtarı; alan adı/HTTPS/deploy (docs/DEPLOY.md);
   JWT_SECRET rotasyonu; CORS'u daraltmak; gerçek ürün fotoğraflarıyla stok
   görselleri değiştirmek (istenirse).
2. Analitik + Sentry; yükleme iskeletleri/next-image.
3. Online ödeme (iyzico/PayTR) — karar bekliyor.
4. Tarayıcı-destekli rakip çekimi (Getir/Trendyol/Hepsiexpress) — hukuki not:
   sahip riski üstlendi, yine de asistan/yarı-otomatik tutulacak.
5. Çoklu-kiracılık (gerçek tenant çözümü + RLS), SMS OTP adaptörü, mobil uygulama.
