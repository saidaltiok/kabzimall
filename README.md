# KabzıMall

Meyve-sebze odaklı **online manav + teslimat** (KabzıMall Market) ve veriyle fiyat
yöneten **yönetim paneli** (KabzıMall Intelligence). İki sütun: (1) içeride veriyle
fiyat/marj zekâsı, (2) dışarıda kaliteli ürünü güvenle teslim.

Detaylı bağlam, iş kuralları ve güncel durum için **[CLAUDE.md](CLAUDE.md)**;
derin referanslar `KabziMall_Guncelleme_v1_1.docx` ve `KabziMall_Teknik_Temel_API.pdf`.

## Monorepo

```
apps/api          NestJS backend (Intelligence+Katalog+Market) — 139 e2e test
apps/admin        Next.js yönetim paneli (:3000) — 9 girişli sidebar + kurye PWA
apps/web          Next.js müşteri vitrini (:3002) — sipariş döngüsü + OTP + yasal sayfalar + SEO/PWA
apps/mobile       React Native (müşteri)         — henüz yok
packages/pricing  FİYAT MOTORU — tek kaynak (birim testli)
```

Öne çıkanlar: İBB hal fiyatı + rakip fiyatları (resmî marketfiyati + online
manavlar) **günlük otomatik** çekilir; maliyet tabanı güvenlik ağı zararına
satışı engeller; "Bugün" ekranı önerilen fiyatları tek tıkla uygular; siparişte
eksik-ürün tercihi, teslimat saati değişikliği onay akışı, e-posta bildirimleri
ve rota optimizasyonu + kurye PWA görünümü vardır.

## Hızlı başlangıç

```bash
# 1) Veritabanı (PostGIS'li Postgres, kabzimall-db)
docker compose up -d

# 2) Fiyat motoru testleri
cd packages/pricing && npm install && npm test

# 3) API  (NOT: start:dev çalışmıyor — dist'ten çalıştırılır)
cd ../../apps/api
cp .env.example .env
npm install
npx prisma migrate dev
npm run build && npm start          # http://localhost:3001/api/v1  (Swagger: /api/docs)

# 4) Panel + vitrin
npm --prefix apps/admin run dev     # :3000  (admin@kabzimall.local / kabzimall123)
npm --prefix apps/web run dev       # :3002
```

> **Test notu:** `apps/api && npm test` paylaşılan dev DB'yi sıfırlar. Gerçek
> veri (İBB/rakip fiyatları) varken önce `pg_dump`, sonra `pg_restore` —
> komutlar CLAUDE.md → "Testler" bölümünde.

## Panel (apps/admin)

Günlük İş: **Bugün** (karar ekranı) · **Piyasa Verisi** (Hal|Rakip) ·
**Fiyatlandırma** (Öneri|Toplu yayın|Marj|Senaryo) · **Siparişler** (Pano|Liste) ·
**Dağıtım Rotası** (+kurye PWA). Yönetim: **Ürünler** · **Satış Analizi** ·
**Maliyet & Kurallar** · **Ayarlar**.

## Vitrin (apps/web)

Ürünler (Meyve/Sebze/**Yöresel Ürünler**) → sepet → harita destekli adres +
eksik-ürün tercihi → **kapıda ödeme** → canlı sipariş takibi (30 sn), iptal ve
saat değişikliği talebi. E-posta OTP ile giriş → cihazdan bağımsız "Siparişlerim".
Kurumsal/yasal: Hakkımızda, İletişim, KVKK, Gizlilik, Mesafeli Satış, İade,
Görsel Kaynakları. API tabanı `NEXT_PUBLIC_API_BASE`
(varsayılan `http://localhost:3001/api/v1`).

Detaylı API kullanımı: [apps/api/README.md](apps/api/README.md).
