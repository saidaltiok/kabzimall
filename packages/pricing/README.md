# @kabzimall/pricing

KabzıMall fiyatlandırma motoru — **tek kaynak**. Mobil, web, admin ve backend
aynı fonksiyonları çağırır; fiyat/marj mantığı başka yerde tekrarlanmaz.

## Neden var?

Taze gıdada kâr ile zarar arasındaki çizgi incedir. Bu modül üç şeyi garanti eder:

1. **Fire doğru hesaplanır** — fire maliyete *toplanmaz, bölünür*. %20 fire maliyeti
   %20 değil %25 artırır (`1 / (1 − 0.20) = 1.25`).
2. **Net marj** komisyon düşülerek, *satış fiyatı üzerinden* hesaplanır.
3. **Taban marj koruması** — hangi strateji seçilirse seçilsin, fiyat minimum
   net kârın altına düşmez.

## Para birimi

Tüm tutarlar **integer kuruş** (minor units): `3490 = 34,90 ₺`. Float yuvarlama
hatalarını önler. Biçimlendirme sunum katmanında yapılır.

## Kullanım

```ts
import { suggestPrice, CostInput, Competitor } from '@kabzimall/pricing';

const cost: CostInput = {
  halAvg: 1870, fireRate: 0.15, labor: 120, packaging: 70, fuel: 50,
  commissionRate: 0.03,
};
const rakipler: Competitor[] = [
  { name: 'Macrocenter', group: 'Premium', price: 4900 },
  { name: 'A101', group: 'İndirim', price: 3990 },
  // ...
];

suggestPrice(cost, rakipler, 'MARGIN', { targetMargin: 0.30 });
// → { price: 3590, netMargin: 0.290, competitionIndex: 81, directCost: 2440, floored: false }
```

### Stratejiler
`MARGIN` · `HAL_MARKUP` (hal + %X otomatik) · `COMP_AVG` · `COMP_AVG_MINUS` · `MEDIAN` · `LOWEST` · `GROUP_AVG` · `FLOOR` · `MANUAL`

### Hiyerarşik çözüm (rakip yoksa hata yok)
`resolvePrice(cost, competitors, chain?)` bir fallback zinciri uygular. "Tüm ürünlere
rakip ortalaması" deyip rakibi olmayan bir ürüne denk gelirsen hata vermez; sırayla
`COMP_AVG → MARGIN → HAL_MARKUP(%100) → FLOOR` zincirinden ilk geçerli olana düşer.

### Fırsat ürünü (loss-leader)
`{ opportunity: true }` ile taban marj bypass edilir; fiyat maliyetin altına inebilir
(`belowCost` döner). Müşteri çekmek için bilinçli zararına satış.

### Hal alım mutabakatı (±500 g tartı)
`reconcileHalPurchase({ recordedKg, actualKg, totalPaid })` efektif kg maliyetini ve
kazanç/kayıp etkisini hesaplar. `weightPrecisionRiskPct(kg)` toplam ağırlığa göre
hassasiyet riskini verir (50 kg → %1, 2 kg → %25).

## Geliştirme

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --import tsx --test  → 16/16 pass
```

## Çekirdek formüller

```
fireCost      = halAvg / (1 − fireRate)
directCost    = fireCost + labor + packaging + fuel + coldStorage + amortization
netMargin(S)  = (S − directCost − S × commissionRate) / S
priceForMargin(m) = directCost / (1 − m − commissionRate)
psych(x)      = round(x/100)·100 − 10        // … ,90 ile biter
```

Referans test vakaları `src/pricing.test.ts` içinde (Teknik Temel dokümanı Bölüm 4.3).
