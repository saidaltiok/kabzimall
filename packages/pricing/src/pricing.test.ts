import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CostInput,
  Competitor,
  fireCost,
  directCost,
  netMargin,
  priceForMargin,
  psych,
  avg,
  median,
  competitionIndex,
  suggestPrice,
  resolvePrice,
  reconcileHalPurchase,
  weightPrecisionRiskPct,
} from './pricing.ts';

/** Teknik dokümandaki "Domates" referans vakası (Bölüm 4.3). */
const domates: CostInput = {
  halAvg: 1870,        // 18,70 ₺
  fireRate: 0.15,
  labor: 120,          // 1,20 ₺
  packaging: 70,       // 0,70 ₺
  fuel: 50,            // 0,50 ₺
  commissionRate: 0.03,
};

const rakipler: Competitor[] = [
  { name: 'Macrocenter', group: 'Premium', price: 4900 },
  { name: 'Carrefour', group: 'Orta', price: 4600 },
  { name: 'Migros', group: 'Orta', price: 4200 },
  { name: 'Getir', group: 'Hızlı', price: 4400 },
  { name: 'A101', group: 'İndirim', price: 3990 },
];

const yakin = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

/* --------------------------- Çekirdek --------------------------- */

test('fireCost: fire BÖLÜNÜR (18,70 / 0,85 = 22,00)', () => {
  assert.ok(yakin(fireCost(domates), 2200));
});

test('fire kuralı: %20 fire maliyeti %25 artırır', () => {
  const c: CostInput = { ...domates, halAvg: 2000, fireRate: 0.2, labor: 0, packaging: 0, fuel: 0 };
  assert.equal(Math.round(fireCost(c)), 2500); // 2000/0.8
});

test('directCost = 22,00 + 2,40 = 24,40', () => {
  assert.ok(yakin(directCost(domates), 2440));
});

test('priceForMargin(%30) ≈ 36,42 ₺ (psych öncesi)', () => {
  assert.ok(yakin(priceForMargin(domates, 0.3), 3642, 1));
});

test('netMargin(35,90) ≈ %29', () => {
  assert.ok(Math.abs(netMargin(domates, 3590) - 0.29) < 0.005);
});

test('psych: 3642 → 3590 ; 4418 → 4390 ; 3990 → 3990', () => {
  assert.equal(psych(3642), 3590);
  assert.equal(psych(4418), 4390);
  assert.equal(psych(3990), 3990);
});

test('avg & median rakip fiyatları', () => {
  const prices = rakipler.map((r) => r.price);
  assert.equal(avg(prices), 4418);
  assert.equal(median(prices), 4400);
});

/* ------------------------ Strateji motoru ----------------------- */

test('MARGIN stratejisi → 35,90 ₺, net marj ~%29, endeks ~81', () => {
  const r = suggestPrice(domates, rakipler, 'MARGIN', { targetMargin: 0.3 });
  assert.equal(r.price, 3590);
  assert.ok(Math.abs(r.netMargin - 0.29) < 0.005);
  assert.equal(r.competitionIndex, 81);
  assert.equal(r.floored, false);
  assert.equal(r.directCost, 2440);
});

test('COMP_AVG → 43,90 ₺', () => {
  assert.equal(suggestPrice(domates, rakipler, 'COMP_AVG').price, 4390);
});

test('MEDIAN → 43,90 ₺', () => {
  assert.equal(suggestPrice(domates, rakipler, 'MEDIAN').price, 4390);
});

test('LOWEST → 39,90 ₺', () => {
  assert.equal(suggestPrice(domates, rakipler, 'LOWEST').price, 3990);
});

test('GROUP_AVG(Premium) → Macrocenter = 48,90 ₺', () => {
  assert.equal(suggestPrice(domates, rakipler, 'GROUP_AVG', { group: 'Premium' }).price, 4890);
});

test('Taban marj koruması: çok düşük rakip fiyatı yükseltilir', () => {
  const ucuzRakip: Competitor[] = [{ name: 'X', group: 'İndirim', price: 2700 }];
  const r = suggestPrice(domates, ucuzRakip, 'LOWEST', { floorMargin: 0.15 });
  assert.equal(r.floored, true);
  assert.equal(r.price, 2990); // priceForMargin(0.15) = 24,40/0,82 = 29,76 → psych 29,90
  assert.ok(r.netMargin >= 0.15);
});

test('MANUAL fiyat psych olmadan korunur', () => {
  const r = suggestPrice(domates, rakipler, 'MANUAL', { manualPrice: 3725, psychological: false });
  assert.equal(r.price, 3725);
});

test('competitionIndex: rakip yoksa null', () => {
  assert.equal(competitionIndex(3590, []), null);
});

test('hatalı fire oranı RangeError fırlatır', () => {
  assert.throws(() => fireCost({ ...domates, fireRate: 1 }), RangeError);
});

/* ----------------------- v2: yeni yetenekler -------------------- */

test('HAL_MARKUP: hal × (1 + %100) → 36,90... psych', () => {
  const r = suggestPrice(domates, rakipler, 'HAL_MARKUP', { halMarkupPct: 1.0 });
  assert.equal(r.strategy, 'HAL_MARKUP');
  assert.equal(r.price, 3690); // 1870*2 = 3740 → psych 36,90
});

test('resolvePrice: rakip yoksa hata vermez, zincire düşer (MARGIN)', () => {
  const r = resolvePrice(domates, [], undefined, { targetMargin: 0.3 });
  assert.equal(r.strategy, 'MARGIN');
  assert.equal(r.usedFallback, true);
  assert.equal(r.price, 3590);
  assert.equal(r.competitionIndex, null);
});

test('resolvePrice: rakip varsa zincirin başını (COMP_AVG) kullanır', () => {
  const r = resolvePrice(domates, rakipler);
  assert.equal(r.strategy, 'COMP_AVG');
  assert.equal(r.usedFallback, false);
  assert.equal(r.price, 4390);
});

test('Fırsat ürünü: taban marj bypass, zararına satışa izin (belowCost)', () => {
  const ucuz: Competitor[] = [{ name: 'X', group: 'İndirim', price: 2000 }];
  const r = suggestPrice(domates, ucuz, 'LOWEST', { opportunity: true });
  assert.equal(r.floored, false);
  assert.equal(r.opportunity, true);
  assert.equal(r.price, 1990);     // psych(2000)
  assert.equal(r.belowCost, true); // 19,90 < 24,40 maliyet
});

test('Hal mutabakatı: 10 kg yerine 10,4 kg gelince birim maliyet düşer (kazanç)', () => {
  const r = reconcileHalPurchase({ recordedKg: 10, actualKg: 10.4, totalPaid: 20000 });
  assert.equal(r.recordedUnitCost, 2000); // 200 ₺ / 10 kg
  assert.equal(r.deltaKg, 0.4);
  assert.ok(r.impactPct! > 0); // gerçek maliyet beklenenden düşük → kazanç
});

test('Tartı hassasiyeti riski: 50 kg → %1, 2 kg → %25', () => {
  assert.ok(Math.abs(weightPrecisionRiskPct(50) - 0.01) < 1e-9);
  assert.ok(Math.abs(weightPrecisionRiskPct(2) - 0.25) < 1e-9);
});
