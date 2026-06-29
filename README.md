# KabzıMall

Meyve-sebze odaklı **online manav + teslimat** (KabzıMall Market) ve veriyle fiyat
yöneten **yönetim paneli** (KabzıMall Intelligence). İki sütun: (1) içeride veriyle
fiyat/marj zekâsı, (2) dışarıda kaliteli ürünü güvenle teslim.

Detaylı bağlam ve iş kuralları için **[CLAUDE.md](CLAUDE.md)**; en güncel ürün/teknik
kararlar `KabziMall_Guncelleme_v1_1.pdf`, API/veri modeli `KabziMall_Teknik_Temel_API.pdf`.

## Monorepo

```
apps/api          NestJS backend (Intelligence+Katalog+Market) — VAR (76 test)
apps/admin        Next.js (yönetim paneli)           — VAR (8 ekran, :3000)
apps/web          Next.js (müşteri vitrini)          — VAR (vitrin/sepet/ödeme, :3002)
apps/mobile       React Native (müşteri)             — henüz yok
packages/pricing  FİYAT MOTORU — tek kaynak (test edilmiş)
```

## Hızlı başlangıç

```bash
# 1) Veritabanı (PostGIS'li Postgres)
docker compose up -d

# 2) Fiyat motoru testleri
cd packages/pricing && npm install && npm test     # 22/22

# 3) Intelligence API
cd ../../apps/api
cp .env.example .env
npm install
npx prisma migrate dev
npm test                                           # 18/18 (DB açık olmalı)
npm run start:dev                                  # http://localhost:3001/api/v1
```

### Yönetim paneli (apps/admin)

```bash
cd apps/admin
npm install
npm run dev        # http://localhost:3000  (API 3001'de çalışıyor olmalı)
```

Ekranlar (prototip tasarımıyla uyumlu): **Dashboard**, **Hal Fiyatları**,
**Rakip Fiyatları**, **Maliyet & Fire**, **Fiyat Öneri Motoru**, **Ürünler & Marj**.
API tabanı `NEXT_PUBLIC_API_BASE` (varsayılan `http://localhost:3001/api/v1`).

### Müşteri vitrini (apps/web)

```bash
cd apps/web
npm install
npm run dev        # http://localhost:3002  (API 3001'de çalışıyor olmalı)
```

Akış: ürünleri gez/ara → sepete ekle → adres/telefon gir → **kapıda ödeme** ile
sipariş ver → onay/takip. Sipariş panelde **Siparişler** ekranında görünür.

Detaylı API kullanımı: [apps/api/README.md](apps/api/README.md).
