# KabzıMall — Mobil (Expo / React Native)

Müşteri mobil uygulaması. Web vitrini (`apps/web`) ile **aynı public storefront
API'sini** kullanır (`/api/v1/storefront/*`). Prototip: `KabziMall_Prototip.html`.

Stack: **Expo SDK 57**, React Native 0.86, React 19, TypeScript, **expo-router**
(dosya tabanlı yönlendirme), `expo-router/ui` headless sekmeler.

## Çalıştırma

```bash
# 0) API ayakta olmalı (repo kökünden): apps/api → npm start (:3001)
cd apps/mobile
npm install --legacy-peer-deps     # React 19 peer çakışması için legacy-peer-deps ŞART
npx expo start                     # QR → Expo Go ile telefonda aç
# telefon ve bilgisayar aynı Wi-Fi'de olmalı
```

> **API adresi otomatik:** `src/api.ts`, Metro host IP'sini `expo-constants`'tan
> türetir → telefon `http://<bilgisayar-IP>:3001/api/v1`'e bağlanır (Expo Go
> `localhost`'a erişemez). Elle geçersiz kılmak için `EXPO_PUBLIC_API_BASE`.

Web önizleme (hızlı görsel kontrol): `npm run web` (react-native-web).

## Yapı

```
app/
  _layout.tsx            Kök: font yükleme + Session/Cart/Toast provider + Stack
  (tabs)/
    _layout.tsx          Alt sekme çubuğu (expo-router/ui: TabList/TabTrigger/TabSlot)
    index.tsx            Ana Sayfa (promo, kategori, taze/yöresel ürünler)
    kategori.tsx         Katalog: kategori filtresi + arama + ızgara
    sepet.tsx            Sepet: miktar, eksik-ürün tercihi, özet
    siparisler.tsx       Siparişlerim (OTP oturumu) + misafir sorgulama
    hesap.tsx            Hesap + giriş/çıkış
  urun/[slug].tsx        Ürün detay (varyant, miktar, sepete ekle)
  odeme.tsx              Ödeme: adres, slot, kapıda ödeme, kupon → sipariş
  siparis/[id].tsx       Sipariş takip (30 sn tazeleme) + başarı + iptal
  giris.tsx              E-posta OTP girişi (modal)
src/
  theme.ts               Prototip renk/tipografi tokenları
  api.ts                 Storefront API istemcisi + oturum (AsyncStorage)
  cart.tsx               Sepet context (AsyncStorage kalıcı)
  session.tsx            Müşteri OTP oturum context
  product.ts format.ts delivery.ts types.ts hooks.ts
components/
  ProductCard.tsx  ui.tsx (Pill, SectionTitle, Toast)
```

## Notlar

- Para her yerde **kuruş** (integer); `tl()` "34,90 ₺" biçimler.
- Ödeme yalnız **kapıda** (CARD/CASH) — API `paymentMethod` ile uyumlu.
- Fiyat/indirim/teslimat ücreti **sunucuda** kesinleşir; ekrandaki tutarlar tahmini.
- **Harita pini:** `components/MapPicker.tsx` — `react-native-webview` içinde Leaflet
  + OpenStreetMap (web vitrini ile aynı). Sürüklenebilir pin + `expo-location` ile
  "Konumumu bul". Pin cihaz konumundan >250 m uzaksa siparişte teyit sorulur.
  `requireGeo` açıkken (varsayılan) konum zorunlu. Her iki modül de **Expo Go**'da
  gömülü — dev build gerekmez.
