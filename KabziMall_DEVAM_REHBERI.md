# KabzıMall — Proje Devam Rehberi (Handoff)

> Bu dosya, projeyi **başka bir bilgisayarda** kaldığın yerden sürdürmen için her şeyi özetler:
> ne yaptık, hangi dosya ne işe yarıyor, alınan kararlar ve yeni makinede Claude'a
> yapıştıracağın hazır bağlam metni. Tarih: 28 Haziran 2026.

---

## 1. Proje özeti

**KabzıMall**, temelde meyve–sebze odaklı; yöresel ürünler (zeytinyağı, nar ekşisi…) ve
ileride et–tavuk satacak bir **online manav + teslimat** işletmesi. Ama asıl farkı:
**veriyle fiyat yöneten bir perakende zekâ platformu** olması.

İki ürün, tek çekirdek:
- **KabzıMall Market** — müşterinin alışveriş yaptığı mobil uygulama + web sitesi.
- **KabzıMall Intelligence** — hal + rakip fiyatı + maliyet → gerçek marj → fiyat öneren,
  her gün karar veren yönetim paneli (fiyat zekâsı / karar destek sistemi).

**Konumlandırma:** (a) içeride veriyle fiyat/marj yönetimi, (b) dışarıda kaliteli ürünü
özenle ve güvenle teslim etmek.

---

## 2. Dosya envanteri

Bütün dosyalar `KabziMall_Proje.zip` içinde. İçerik:

| Dosya | Tür | Ne işe yarar |
|---|---|---|
| `KabziMall_Proje_Dokumani.docx` | Word | Ana PRD (v1) — vizyon, ekranlar, modüller, fiyat zekâsı, yol haritası |
| `KabziMall_Teknik_Temel_API.docx` | Word | Veri modeli, API sözleşmesi, fiyat formülleri, akışlar (geliştiriciye hazır) |
| `KabziMall_Guncelleme_v1_1.docx` | Word | **En güncel kararlar** — PRD+Teknik üstüne işlenen delta (v1.1) |
| `KabziMall_Wireframes.html` | HTML | Düşük çözünürlüklü ekran taslakları (yapı/akış) |
| `KabziMall_Tasarim_HiFi.html` | HTML | Yüksek çözünürlüklü tasarım yönü (marka + ekranlar) |
| `KabziMall_Prototip.html` | HTML | **Tıklanabilir müşteri uygulaması** (sepet/ödeme akışı çalışır) |
| `KabziMall_Panel_Prototip.html` | HTML | **Tıklanabilir yönetim paneli** — fiyat zekâsı canlı hesaplar |
| `KabziMall_Logo_Splash.html` | HTML | İlk logo (terazi) + splash ekranı |
| `KabziMall_Logo_Konseptler.html` | HTML | 6 logo yönü (terazi, kasa, rozet, filiz, poşet, meyve) |
| `KabziMall_Logo_Konseptler_2.html` | HTML | Kalite/teslimat temalı 5 logo yönü (yaprak+onay, kalkan, el, konum, poşet+onay) |
| `packages/pricing/` | Kod (TypeScript) | **Tek gerçek kod**: fiyatlandırma motoru + 22 birim testi |

> HTML dosyalarını çift tıklayıp tarayıcıda aç. `.docx` dosyalarını Word/Google Docs ile aç.
> En iyi görünüm için internet bağlantısı (Google Fonts) açık olsun.

---

## 3. Marka & tasarım sistemi

- **Renkler:** Forest `#1F4D38` (ana), Moss `#5C8A5A`, Persimmon `#E8703A` (aksan),
  Honey `#E6B450`, Berry `#9E2B3A`, Cream `#F6F1E7` (zemin), Ink `#1E241C`.
- **Tipografi:** Başlık/marka = **Fraunces** (sıcak serif), arayüz = **Inter**.
- **Logo durumu:** 11 konsept sunuldu, **karar bekliyor** (ekiple netleşecek).
  İlk öneri: *Terazi* (kavram) veya *Yaprak+onay* (taze+kalite); *Kasa* en "manav" olanı.
- **Para birimi (kararı):** her yerde **integer kuruş** (3490 = 34,90 ₺).

---

## 4. Alınan başlıca kararlar (özet)

Detayı `KabziMall_Guncelleme_v1_1.docx` içinde. Kısaca:

1. **Teslimat:** önce ertesi gün (slot), sonra anlık sipariş (faz 2).
2. **Hizmet bölgesi:** haritada poligon (PostGIS); aynı veri reklam hedeflemesini besler.
3. **Hal fiyatı GÜNDE 1 kez** (belediye yayını) — 3 sabit slot kaldırıldı. Rakip günde 1–2.
4. **Otomatik fiyat kaynağı** (kaynak adaptörü): hal resmi liste; rakip otomasyonu hukuki
   netleşene dek elle (sahip mevcut riski üstlendi).
5. **Hiyerarşik fiyat çözümü** (rakip yoksa hata yok → fallback zinciri) — KODDA HAZIR.
6. **Hal-bazlı otomatik fiyatlama** (hal + %X, threshold) — KODDA HAZIR.
7. **Fırsat ürünü** (zararına satış / loss-leader) — KODDA HAZIR.
8. **Hal alımları + ±500 g tartı mutabakatı** (efektif kg maliyeti) — KODDA HAZIR.
9. **Maliyet:** ürün-bazlı (ambalaj) vs havuz/dağıtımlı (işçilik, benzin → hacme bölünür).
10. **Teslimat ücreti:** kademeli, eşik üstü ücretsiz, panelden ayarlanır.
11. **Hazır sepetler parametrik:** kişi sayısı + kompozisyon; varyant → ayrı ürün.
12. **Fire kuralı (kritik):** fire maliyete TOPLANMAZ, BÖLÜNÜR (%20 fire → +%25 maliyet).

---

## 5. Fiyat motoru (tek gerçek kod) — nasıl çalıştırılır

```bash
cd packages/pricing
npm install
npm run typecheck   # tsc --noEmit
npm test            # 22/22 test geçmeli
```

İçindekiler: `fireCost`, `directCost`, `netMargin`, `priceForMargin`, `psych`,
`suggestPrice`, `resolvePrice` (fallback), `reconcileHalPurchase`, `weightPrecisionRiskPct`.
Bu modül mobil/web/admin/backend tarafından **tek kaynak** olarak çağrılacak.

---

## 6. Yeni bilgisayarda nasıl devam edersin

1. `KabziMall_Proje.zip` dosyasını yeni bilgisayara taşı (USB, e-posta, Drive vb.).
2. Zip'i bir klasöre aç.
3. Claude/Cowork uygulamasını aç, bu klasörü **çalışma klasörü olarak seç** (veya dosyaları yükle).
4. Aşağıdaki **"7. Hazır bağlam metni"**ni kopyalayıp Claude'a ilk mesaj olarak yapıştır.
5. Claude güncel kararları (v1.1) ve fiyat motorunu okuyup kaldığın yerden devam eder.

> İdeal kalıcı yöntem: kodu bir **Git deposuna** (GitHub/GitLab) koymak. Böylece her
> bilgisayardan `git clone` ile aynı koda erişirsin. İlk fırsatta `packages/pricing`'i
> ve dokümanları bir repoya koymanı öneririm.

---

## 7. Hazır bağlam metni (yeni makinede Claude'a yapıştır)

```
KabzıMall adlı bir projeye başka bir bilgisayardan devam ediyorum. Klasördeki dosyalar
projenin tüm geçmişini içeriyor. Lütfen önce şunları oku:
- KabziMall_Guncelleme_v1_1.docx  (EN GÜNCEL kararlar — öncelik bunda)
- KabziMall_Teknik_Temel_API.docx (veri modeli + API + fiyat formülleri)
- KabziMall_Proje_Dokumani.docx   (ana PRD)
- packages/pricing/ (çalışan fiyat motoru + testler)

Proje: meyve-sebze odaklı online manav + teslimat (KabzıMall Market) ve veriyle fiyat
yöneten yönetim paneli (KabzıMall Intelligence). İki sütun: (1) içeride fiyat/marj zekâsı,
(2) dışarıda kaliteli ürünü güvenle teslim. Para birimi: integer kuruş. Stack: React Native
(mobil), Next.js (web+admin), NestJS + PostgreSQL + Redis (backend), monorepo; fiyat mantığı
packages/pricing'te tek kaynak. Marka: Fraunces+Inter, forest #1F4D38 / persimmon #E8703A.

Önemli kurallar: fire maliyete TOPLANMAZ, BÖLÜNÜR (%20 fire → +%25). Hal fiyatı günde 1 kez.
Rakip yoksa fiyat fallback zinciri (resolvePrice) devreye girer. Logo henüz seçilmedi (11 konsept var).

Tamamlananlar: PRD, teknik temel, v1.1 güncelleme, hi-fi tasarım, wireframe, tıklanabilir
müşteri uygulaması ve yönetim paneli prototipleri, test edilmiş fiyat motoru, 11 logo konsepti.

SIRADAKİ ADIM: Güncel modele (v1.1) göre NestJS "Intelligence API" iskeletini kurmak;
özellikle POST /intel/price/resolve ve /intel/hal-purchases uçlarının packages/pricing'i
çağıracak şekilde yazılması. Bana bu adımdan devam et. Önce kısa bir plan çıkar, sonra başla.
```

---

## 8. Sıradaki adımlar ve açık kararlar

**Sıradaki iş:** NestJS Intelligence API iskeleti (`/intel/price/resolve`, `/intel/hal-purchases`,
`/intel/cost-pool`) — `packages/pricing`'i çağıracak şekilde.

**Açık kararlar:**
- Logo yönü (11 konsept arasından seçim).
- Ödeme sağlayıcı (pre-auth + partial capture: iyzico/PayTR vb.).
- Hal otomatik kaynağı (İBB endpoint/saat teyidi).
- Rakip otomatik toplama (hukuki araştırma).
- Harita altyapısı (PostGIS + harita sağlayıcı), Push sağlayıcı (FCM/APNs).

---
*KabzıMall — bu rehber, projenin o ana kadarki tüm bağlamını taşır. İyi çalışmalar.*
