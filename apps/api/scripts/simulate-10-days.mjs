/**
 * 10 günlük gerçekçi kullanım simülasyonu — canlı API üzerinden (iş kuralları
 * gerçek yollardan işler), zamanlar Prisma ile geriye tarihlenir.
 *
 * Her gün: kasa açılışı → hal fiyatları + hal alımları → fiyat kararları →
 * web siparişleri (tartı/teslim/iptal/puan/sorun/iade/saat talebi) →
 * tezgâh satışları (+iade) → masraflar → kasa kapanışı (Z).
 * Ek: kampanya kuponu + indirimli ürünler + destek talepleri.
 *
 * Koşum:  cd apps/api && node scripts/simulate-10-days.mjs
 * Şart:   API http://localhost:3001 üzerinde AÇIK olmalı.
 * Not:    Deterministik akış için seed'li RNG (aynı boş DB'de benzer sonuç).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:3001/api/v1';
const DAYS = 10;
const prisma = new PrismaClient();

/* ------------------------------ RNG (seed'li) ------------------------------ */
let seed = 20260708;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)); // [a,b]
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

/* ------------------------------- Yardımcılar ------------------------------- */
let TOKEN = '';
async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(json).slice(0, 180)}`);
  return json;
}
const day = (d, h = 12, m = 0) => { // d gün önce, saat h:m (yerel)
  const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, m + ri(0, 9), ri(0, 59), 0); return t;
};
const iso = (t) => t.toISOString().slice(0, 10);

/** Siparişin tüm izlerini (durum geçmişi, bildirim, kasa) kurgu zamanına çek. */
async function backdateOrder(orderId, code, created, stepTimes) {
  await prisma.order.update({ where: { id: orderId }, data: { createdAt: created } });
  const hist = await prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < hist.length; i++) {
    await prisma.orderStatusHistory.update({ where: { id: hist[i].id }, data: { createdAt: stepTimes[Math.min(i, stepTimes.length - 1)] } });
  }
  const nots = await prisma.notification.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < nots.length; i++) {
    await prisma.notification.update({ where: { id: nots[i].id }, data: { createdAt: stepTimes[Math.min(i, stepTimes.length - 1)] } });
  }
  await prisma.cashMovement.updateMany({ where: { refCode: code }, data: { createdAt: stepTimes[stepTimes.length - 1] } });
  await prisma.stockMovement.updateMany({ where: { refCode: code }, data: { createdAt: created } });
}

/* ------------------------------ Müşteri havuzu ----------------------------- */
const CUSTOMERS = [
  { name: 'Ayşe Yıldırım', phone: '0532 481 22 17', email: 'ayse.yildirim@example.com', addr: 'Caferağa Mah. Moda Cad. 41/3', sadik: true },
  { name: 'Mehmet Kaya', phone: '0533 274 90 55', email: 'mkaya61@example.com', addr: 'Osmanağa Mah. Söğütlüçeşme Cad. 12/A', sadik: true },
  { name: 'Zeynep Arslan', phone: '0542 617 38 41', email: 'zeyneparslan@example.com', addr: 'Fenerbahçe Mah. Bağdat Cad. 88 D:5', sadik: true },
  { name: 'Hasan Demirtaş', phone: '0505 992 14 76', email: null, addr: 'Koşuyolu Mah. Cenap Şahabettin Sok. 7', sadik: true },
  { name: 'Elif Şahin', phone: '0538 405 67 23', email: 'elifsahin@example.com', addr: 'Göztepe Mah. Fahrettin Kerim Gökay Cad. 156/2', sadik: true },
  { name: 'Murat Öztürk', phone: '0530 118 45 92', email: null, addr: 'Suadiye Mah. Plaj Yolu Sok. 22', sadik: true },
  { name: 'Fatma Çelik', phone: '0544 726 81 30', email: 'fatmacelik@example.com', addr: 'Erenköy Mah. Ethem Efendi Cad. 63/1', sadik: false },
  { name: 'Ali Doğan', phone: '0506 353 29 68', email: null, addr: 'Caddebostan Mah. Operatör Cemil Topuzlu Cad. 110', sadik: false },
  { name: 'Selin Aydın', phone: '0535 840 73 14', email: 'selinaydin@example.com', addr: 'Kozyatağı Mah. Şemsettin Günaltay Cad. 244 D:8', sadik: false },
  { name: 'Oğuz Karan', phone: '0541 267 95 03', email: null, addr: 'Bostancı Mah. Emin Ali Paşa Cad. 31/4', sadik: false },
  { name: 'Derya Koçak', phone: '0537 519 60 88', email: 'deryakocak@example.com', addr: 'Feneryolu Mah. Fahrettin Kerim Gökay Cad. 20', sadik: false },
  { name: 'Kemal Uysal', phone: '0545 671 42 59', email: null, addr: 'Rasimpaşa Mah. Rıhtım Cad. 5/2', sadik: false },
  { name: 'Gamze Polat', phone: '0531 934 18 27', email: 'gamzepolat@example.com', addr: 'Zühtüpaşa Mah. Kalamış Fener Cad. 74', sadik: false },
  { name: 'Burak Ekinci', phone: '0539 482 56 71', email: null, addr: 'Hasanpaşa Mah. Uzunçayır Cad. 9 D:12', sadik: false },
];
const NOTES = [null, null, null, 'Kapıya bırak', 'Zili çalma, bebek uyuyor', 'Gelmeden ara', 'Poşetleri ayır lütfen', null];
const EXPENSES = [
  ['Poşet ve ambalaj alımı', 12000, 28000], ['Çay ocağı', 3000, 8000], ['Nakliye/benzin', 25000, 60000],
  ['Temizlik malzemesi', 8000, 18000], ['Su/elektrik avansı', 30000, 70000],
];

/* --------------------------------- Durum ---------------------------------- */
const sayac = { siparis: 0, teslim: 0, iptal: 0, puan: 0, sorun: 0, iade: 0, fis: 0, fisIade: 0, halAlim: 0, fiyatKarari: 0, saatTalebi: 0 };
const firstOrderDone = new Set(); // HOSGELDIN10 tek kullanım/müşteri

/* ================================== AKIŞ =================================== */
async function main() {
  const login = await api('POST', '/auth/login', { email: 'admin@kabzimall.local', password: 'kabzimall123' });
  TOKEN = login.accessToken;

  // Vitrindeki satılabilir ürünler (fiyatlı + aktif)
  const prods = (await api('GET', '/catalog/products?active=true')).data
    .filter((p) => p.kind === 'SIMPLE' && p.basePrice != null && p.basePrice > 0);
  const bySlug = new Map(prods.map((p) => [p.slug, p]));
  const POPULER = prods.filter((p) => ['Sebze', 'Meyve'].includes(p.category?.name)).map((p) => p.slug);
  const YORESEL = prods.filter((p) => p.category?.name === 'Yöresel Ürünler').map((p) => p.slug);
  console.log(`Ürün havuzu: ${prods.length} (taze ${POPULER.length}, yöresel ${YORESEL.length})`);

  // Hal fiyat yürüyüşü tabanı: mevcut satış fiyatının ~%55'i
  const halBase = new Map(prods.map((p) => [p.slug, Math.max(500, Math.round(p.basePrice * 0.55))]));

  for (let d = DAYS; d >= 1; d--) {
    const bugun = iso(day(d));
    console.log(`\n═══ GÜN -${d} (${bugun}) ═══`);

    /* 1) Kasa açılışı 07:30 */
    const acilis = ri(500, 800) * 100;
    const sess = await api('POST', '/admin/cash/open', { openingFloat: acilis, note: 'Sabah açılışı' });
    await prisma.registerSession.update({ where: { id: sess.id }, data: { openedAt: day(d, 7, 30) } });

    /* 2) Hal fiyatları (tüm taze ürünler) + hal alımları 08:00-10:00 */
    for (const slug of POPULER) {
      const eski = halBase.get(slug);
      const yeni = Math.max(400, Math.round(eski * (1 + (rnd() - 0.5) * 0.12)));
      halBase.set(slug, yeni);
      await api('POST', '/intel/hal/entries', { productId: slug, price: yeni, date: bugun, source: 'MANUAL' }).catch(() => {});
    }
    const alinacak = [...POPULER].sort(() => rnd() - 0.5).slice(0, ri(5, 8));
    // Gerçek esnaf akışı: hal alımı sabah bankadan/cepten konan sermaye ile yapılır —
    // kasa gün boyu eksiye düşmesin diye alım bütçesi önce DEPOSIT olarak girer.
    const planli = alinacak.map((slug) => ({ slug, kg: ri(8, 40), birim: halBase.get(slug) }));
    const butce = Math.ceil(planli.reduce((s, a) => s + a.kg * a.birim, 0) / 100000) * 100000; // 1000₺'ye yuvarla
    await api('POST', '/admin/cash/movements', { type: 'IN', category: 'DEPOSIT', amount: butce, note: 'Hal alımı sermayesi (banka)' });
    for (const { slug, kg, birim } of planli) {
      try {
        const alim = await api('POST', '/intel/hal-purchases', {
          productId: slug, recordedKg: kg, actualKg: Math.round(kg * (1 - rnd() * 0.02) * 10) / 10,
          totalPaid: kg * birim,
        });
        const t = day(d, ri(8, 9));
        await prisma.halPurchase.update({ where: { id: alim.id }, data: { createdAt: t } });
        await prisma.cashMovement.updateMany({ where: { refCode: `HAL:${alim.id}` }, data: { createdAt: t } });
        await prisma.stockMovement.updateMany({ where: { refCode: `HAL:${alim.id}` }, data: { createdAt: t } });
        sayac.halAlim++;
      } catch (e) { console.log(`  ! hal alımı ${slug}: ${e.message}`); }
    }

    /* 3) Fiyat kararları (3 günde bir, hal maliyeti kayanlara) 10:30 */
    if (d % 3 === 1) {
      const hedefler = [...alinacak].slice(0, ri(2, 4));
      for (const slug of hedefler) {
        const p = bySlug.get(slug);
        const yeniFiyat = Math.round((halBase.get(slug) * 2.05) / 10) * 10; // hal×~2 → 10 kuruşa yuvarla
        try {
          await api('POST', '/intel/price/apply', { productId: slug, price: yeniFiyat, strategy: 'HAL_MARKUP', reason: 'Günlük hal maliyeti güncellemesi' });
          await prisma.priceHistory.updateMany({ where: { product: { slug }, reason: 'Günlük hal maliyeti güncellemesi', changedAt: { gte: new Date(Date.now() - 60000) } }, data: { changedAt: day(d, 10, 30) } });
          p.basePrice = yeniFiyat;
          sayac.fiyatKarari++;
        } catch (e) { console.log(`  · fiyat ${slug}: ${e.message.slice(0, 90)}`); }
      }
    }

    /* 3b) Kampanya: 7. günde kupon + 2 ürüne indirim; son gün indirim kalkar */
    if (d === 7) {
      await api('POST', '/admin/coupons', { code: 'SEBZE10', type: 'PERCENT', value: 10, minSubtotal: 30000, maxUses: 20 }).catch(() => {});
      await prisma.coupon.updateMany({ where: { code: 'SEBZE10' }, data: { createdAt: day(d, 11) } });
      for (const slug of ['domates', 'patates'].filter((s) => bySlug.has(s))) {
        const p = bySlug.get(slug);
        await api('PATCH', `/catalog/products/${p.id}`, { discountedPrice: Math.round(p.basePrice * 0.88) }).catch(() => {});
      }
      console.log('  🎟️ SEBZE10 kampanyası başladı (+2 ürün indirimi)');
    }
    if (d === 2) {
      for (const slug of ['domates', 'patates'].filter((s) => bySlug.has(s))) {
        const p = bySlug.get(slug);
        await api('PATCH', `/catalog/products/${p.id}`, { discountedPrice: null }).catch(() => {});
      }
    }

    /* 4) Web siparişleri 09:00-18:30 */
    const nSiparis = ri(4, 8);
    for (let s = 0; s < nSiparis; s++) {
      const mus = pick(CUSTOMERS.filter((c) => c.sadik || chance(0.5)));
      const kalemSayisi = ri(2, 6);
      const havuz = chance(0.8) ? POPULER : [...POPULER, ...YORESEL];
      const secilen = [...new Set(Array.from({ length: kalemSayisi }, () => pick(havuz)))];
      const items = secilen.map((slug) => ({
        slug, qty: bySlug.get(slug).unitLabel === 'kg' ? pick([0.5, 1, 1, 1.5, 2, 2.5, 3]) : ri(1, 3),
      }));
      let couponCode;
      if (mus.email && !firstOrderDone.has(mus.phone) && chance(0.5)) couponCode = 'HOSGELDIN10';
      else if (d <= 7 && chance(0.15)) couponCode = 'SEBZE10';

      const saat = ri(9, 18);
      let o;
      try {
        o = await api('POST', '/storefront/orders', {
          items,
          customer: { name: mus.name, phone: mus.phone, email: mus.email ?? undefined, address: mus.addr, district: 'Kadıköy' },
          note: pick(NOTES) ?? undefined,
          couponCode,
        });
      } catch (e) {
        if (couponCode) { // kupon tükenmiş olabilir — kuponsuz tekrar dene
          o = await api('POST', '/storefront/orders', {
            items, customer: { name: mus.name, phone: mus.phone, email: mus.email ?? undefined, address: mus.addr, district: 'Kadıköy' },
          }).catch(() => null);
        }
        if (!o) { console.log(`  ! sipariş: ${e.message}`); continue; }
      }
      firstOrderDone.add(mus.phone);
      sayac.siparis++;

      const created = day(d, saat);
      const kader = rnd();
      const times = [created];
      const step = (dk) => { times.push(new Date(times[times.length - 1].getTime() + dk * 60000)); return times[times.length - 1]; };

      try {
        if (kader < 0.06) { // erken iptal (müşteri)
          await api('POST', `/storefront/orders/${o.id}/cancel`);
          step(ri(10, 40)); sayac.iptal++;
        } else if (kader < 0.10) { // hazırlıkta esnaf iptali (stok yok senaryosu)
          await api('PATCH', `/admin/orders/${o.id}/status`, { status: 'PREPARING' }); step(ri(15, 45));
          await api('PATCH', `/admin/orders/${o.id}/status`, { status: 'CANCELLED' }); step(ri(5, 20));
          sayac.iptal++;
        } else {
          // saat talebi (%12)
          if (chance(0.12)) {
            const slots = (await api('GET', '/storefront/slots')).data;
            if (slots.length > 1) {
              const hedef = pick(slots);
              await api('POST', `/storefront/orders/${o.id}/slot-change`, { date: hedef.date, window: hedef.window }).catch(() => {});
              await api('POST', `/admin/orders/${o.id}/slot-change`, { approve: chance(0.75) }).catch(() => {});
              sayac.saatTalebi++;
            }
          }
          await api('PATCH', `/admin/orders/${o.id}/status`, { status: 'PREPARING' }); step(ri(20, 80));
          if (d === 1 && chance(0.25)) { await backdateOrder(o.id, o.code, created, times); continue; } // pano bugün dolu kalsın
          // tartı: kg kalemlerde ±%8 sapma
          const packItems = o.items.map((it) => ({
            itemId: it.id,
            pickedQty: it.unitLabel === 'kg' ? Math.round(it.orderedQty * (1 + (rnd() - 0.45) * 0.16) * 100) / 100 : it.orderedQty,
          }));
          await api('POST', `/admin/orders/${o.id}/pack`, { items: packItems }); step(ri(10, 30));
          await api('PATCH', `/admin/orders/${o.id}/status`, { status: 'OUT_FOR_DELIVERY' }); step(ri(25, 60));

          if (d >= 2 || chance(0.85)) { // son gün birkaç sipariş yolda kalsın
            await api('PATCH', `/admin/orders/${o.id}/status`, { status: 'DELIVERED' }); step(ri(20, 60));
            sayac.teslim++;

            if (chance(0.45)) { // puan
              const yildiz = pick([5, 5, 5, 4, 4, 5, 3, 2]);
              const yorum = yildiz >= 4 ? pick(['Her şey çok tazeydi, teşekkürler', 'Hızlı geldi, tartı da dürüst', undefined, undefined]) : 'Domatesler biraz ezikti';
              await api('POST', `/storefront/orders/${o.id}/rating`, { rating: yildiz, comment: yorum }).catch(() => {});
              sayac.puan++;
            }
            if (chance(0.06)) { // sorun bildirimi (teslimden hemen sonra)
              const kalem = pick(o.items);
              await api('POST', `/storefront/orders/${o.id}/issue`, { itemIds: [kalem.id], reason: pick(['EZIK_CURUK', 'EKSIK']), message: 'Ürün beklediğim gibi çıkmadı' }).catch(() => {});
              sayac.sorun++;
            }
          }
        }
      } catch (e) { console.log(`  ! akış ${o.code}: ${e.message}`); }
      await backdateOrder(o.id, o.code, created, times);
    }

    /* 5) Tezgâh satışları gün boyu */
    const nFis = ri(5, 11);
    for (let f = 0; f < nFis; f++) {
      const kalemler = [...new Set(Array.from({ length: ri(1, 4) }, () => pick(POPULER)))].map((slug) => {
        const p = bySlug.get(slug);
        const qty = p.unitLabel === 'kg' ? pick([0.5, 1, 1, 1.5, 2]) : ri(1, 4);
        const pazarlik = chance(0.25) ? { unitPrice: Math.max(100, Math.floor(p.basePrice / 500) * 500) } : {};
        return { slug, qty, ...pazarlik };
      });
      try {
        const fis = await api('POST', '/admin/pos/sales', { items: kalemler, note: chance(0.1) ? 'komşu esnaf' : undefined });
        const t = day(d, ri(9, 20));
        await backdateOrder(fis.id, fis.code, t, [t]);
        sayac.fis++;
        if (sayac.fisIade < 2 && chance(0.04)) { // nadir tezgâh iadesi
          await api('PATCH', `/admin/orders/${fis.id}/status`, { status: 'CANCELLED' });
          await prisma.cashMovement.updateMany({ where: { refCode: fis.code, category: 'SALE_REVERSAL' }, data: { createdAt: new Date(t.getTime() + 30 * 60000) } });
          sayac.fisIade++;
        }
      } catch (e) { console.log(`  ! tezgâh: ${e.message}`); }
    }

    /* 6) Masraflar */
    for (let m = 0; m < ri(1, 2); m++) {
      const [ad, min, max] = pick(EXPENSES);
      await api('POST', '/admin/cash/movements', { type: 'OUT', category: 'EXPENSE', amount: ri(min / 100, max / 100) * 100, note: ad });
    }
    if (chance(0.3)) await api('POST', '/admin/cash/movements', { type: 'OUT', category: 'WITHDRAWAL', amount: ri(200, 500) * 100, note: 'Esnaf harcaması' });
    await prisma.cashMovement.updateMany({ where: { sessionId: sess.id, refCode: null }, data: { createdAt: day(d, ri(12, 17)) } });

    /* 7) Kasa kapanışı 21:00 */
    const cur = await api('GET', '/admin/cash/current');
    const beklenen = cur.totals?.balance ?? 0;
    const fark = chance(0.6) ? 0 : -ri(300, 1500);
    const kapali = await api('POST', '/admin/cash/close', { counted: Math.max(0, beklenen + fark) });
    await prisma.registerSession.update({ where: { id: kapali.id }, data: { openedAt: day(d, 7, 30), closedAt: day(d, 21, 0) } });
    console.log(`  kasa: açılış ${acilis / 100}₺ → beklenen ${(beklenen / 100).toFixed(2)}₺ (fark ${fark / 100}₺)`);
  }

  /* 8) Kısmi iadeler (teslim edilmiş 2 siparişe, farklı günlerde) */
  const teslimliler = await prisma.order.findMany({
    where: { status: 'DELIVERED', channel: 'WEB', refunds: { none: {} } },
    orderBy: { createdAt: 'asc' }, take: 30, include: { items: true },
  });
  for (const [i, yontem] of [['CASH', 4], ['COUPON', 7]].map(([m], ix) => [ix, m])) {
    const o = teslimliler[ri(0, teslimliler.length - 1)];
    if (!o?.items.length) continue;
    const kalem = o.items[0];
    try {
      await api('POST', `/admin/orders/${o.id}/refund`, {
        items: [{ itemId: kalem.id, qty: Math.min(kalem.pickedQty ?? kalem.orderedQty, 0.5) }],
        method: yontem, restock: false, reason: yontem === 'CASH' ? 'ezik ürün' : 'eksik gramaj telafisi',
      });
      const rt = new Date(o.createdAt.getTime() + 26 * 3600 * 1000);
      await prisma.orderRefund.updateMany({ where: { orderId: o.id }, data: { createdAt: rt } });
      await prisma.cashMovement.updateMany({ where: { refCode: { startsWith: 'IADE:' }, createdAt: { gte: new Date(Date.now() - 60000) } }, data: { createdAt: rt } });
      sayac.iade++;
    } catch (e) { console.log(`! iade: ${e.message}`); }
  }

  /* 9) Destek talepleri (2 kapalı + 1 açık) */
  const destekler = [
    { name: 'Fatma Çelik', email: 'fatmacelik@example.com', message: 'Teslimat saatini sabaha alma şansımız var mı acaba?', d: 6, reply: 'Merhaba, sabah 10:00-13:00 penceresini seçebilirsiniz; mevcut siparişinizi de o saate aldık.' },
    { name: 'Oğuz Karan', email: null, phone: '0541 267 95 03', message: 'Zeytinyağınızın asit oranı nedir?', d: 4, reply: 'Merhaba, naturel sızma zeytinyağımız %0,4 asit oranındadır, soğuk sıkımdır.' },
    { name: 'Selin Aydın', email: 'selinaydin@example.com', message: 'Fatura bilgilerimi güncelleyebilir miyim? Şirket adına almak istiyorum.', d: 1, reply: null },
  ];
  for (const dt of destekler) {
    try {
      await api('POST', '/storefront/support', { name: dt.name, email: dt.email ?? undefined, phone: dt.phone ?? undefined, message: dt.message });
      const t = await prisma.supportTicket.findFirst({ where: { name: dt.name }, orderBy: { createdAt: 'desc' } });
      if (t) {
        await prisma.supportTicket.update({ where: { id: t.id }, data: { createdAt: day(dt.d, ri(10, 18)) } });
        if (dt.reply) await api('PATCH', `/admin/support/${t.id}`, { reply: dt.reply, status: 'CLOSED' }).catch(() => {});
      }
    } catch (e) { console.log(`! destek: ${e.message}`); }
  }

  console.log('\n════════ ÖZET ════════');
  console.log(JSON.stringify(sayac, null, 1));
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('SİMÜLASYON HATASI:', e); await prisma.$disconnect(); process.exit(1); });
