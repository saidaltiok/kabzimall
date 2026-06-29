# KabzıMall

Meyve-sebze odaklı **online manav + teslimat** (KabzıMall Market) ve veriyle fiyat
yöneten **yönetim paneli** (KabzıMall Intelligence). İki sütun: (1) içeride veriyle
fiyat/marj zekâsı, (2) dışarıda kaliteli ürünü güvenle teslim.

Detaylı bağlam ve iş kuralları için **[CLAUDE.md](CLAUDE.md)**; en güncel ürün/teknik
kararlar `KabziMall_Guncelleme_v1_1.pdf`, API/veri modeli `KabziMall_Teknik_Temel_API.pdf`.

## Monorepo

```
apps/api          NestJS backend (Intelligence API)  — VAR
apps/mobile       React Native (müşteri)             — henüz yok
apps/web          Next.js (müşteri sitesi)           — henüz yok
apps/admin        Next.js (panel + Intelligence)     — henüz yok
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

Detaylı API kullanımı: [apps/api/README.md](apps/api/README.md).
