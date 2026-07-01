// Demo veri tohumlama (geliştirme). Çalıştır: npm run db:seed (apps/api).
// Idempotent: tekrar çalıştırınca mevcut kayıtları günceller.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const T = '00000000-0000-0000-0000-000000000001'; // DEV_TENANT_ID
const img = (t) => `https://placehold.co/400x300/1F4D38/F6F1E7?text=${t}`;

const CATEGORIES = [
  { slug: 'meyve', name: 'Meyve' },
  { slug: 'sebze', name: 'Sebze' },
];
const PRODUCTS = [
  { slug: 'domates', name: 'Domates', cat: 'sebze', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590, stockQty: 50, isFreshDaily: true, imageUrl: img('Domates') },
  { slug: 'cilek', name: 'Çilek', cat: 'meyve', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6400, stockQty: 3, isFreshDaily: true, isLocal: true, imageUrl: img('Cilek') },
  { slug: 'muz', name: 'Muz', cat: 'meyve', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5200, stockQty: 0, imageUrl: img('Muz') },
  { slug: 'salatalik', name: 'Salatalık', cat: 'sebze', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 2250, discountedPrice: 1790, stockQty: 40, imageUrl: img('Salatalik') },
];

// Türkçe-duyarlı slug (İBB import'uyla aynı mantık → fiyatlar eşleşir).
function slugifyTr(s) {
  const m = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s.trim().toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => m[c] ?? c).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Halde bulunan yaygın meyve-sebze listesi (temiz katalog çekirdeği).
// isActive=false → önce fiyatlanır/gözden geçirilir, sonra vitrine çıkar.
const PRODUCE = [
  // Sebze
  ['Domates', 'sebze'], ['Salatalık', 'sebze'], ['Sivri Biber', 'sebze'], ['Çarliston Biber', 'sebze'],
  ['Dolmalık Biber', 'sebze'], ['Kırmızı Biber', 'sebze'], ['Patlıcan', 'sebze'], ['Kabak', 'sebze'],
  ['Patates', 'sebze'], ['Kuru Soğan', 'sebze'], ['Taze Soğan', 'sebze'], ['Sarımsak', 'sebze'],
  ['Havuç', 'sebze'], ['Kıvırcık Marul', 'sebze'], ['Aysberg Marul', 'sebze'], ['Maydanoz', 'sebze'],
  ['Dereotu', 'sebze'], ['Roka', 'sebze'], ['Tere', 'sebze'], ['Ispanak', 'sebze'], ['Pazı', 'sebze'],
  ['Pırasa', 'sebze'], ['Beyaz Lahana', 'sebze'], ['Kırmızı Lahana', 'sebze'], ['Karnabahar', 'sebze'],
  ['Brokoli', 'sebze'], ['Taze Fasulye', 'sebze'], ['Barbunya', 'sebze'], ['Bakla', 'sebze'],
  ['Bamya', 'sebze'], ['Bezelye', 'sebze'], ['Enginar', 'sebze'], ['Kereviz', 'sebze'], ['Turp', 'sebze'],
  ['Balkabağı', 'sebze'], ['Kültür Mantarı', 'sebze'], ['Semizotu', 'sebze'], ['Nane', 'sebze'],
  ['Pancar', 'sebze'], ['Cherry Domates', 'sebze'],
  // Meyve
  ['Starking Elma', 'meyve'], ['Golden Elma', 'meyve'], ['Granny Smith Elma', 'meyve'], ['Armut', 'meyve'],
  ['Muz', 'meyve'], ['Portakal', 'meyve'], ['Mandalina', 'meyve'], ['Limon', 'meyve'], ['Greyfurt', 'meyve'],
  ['Çilek', 'meyve'], ['Kiraz', 'meyve'], ['Vişne', 'meyve'], ['Kayısı', 'meyve'], ['Şeftali', 'meyve'],
  ['Nektarin', 'meyve'], ['Erik', 'meyve'], ['Kavun', 'meyve'], ['Karpuz', 'meyve'], ['Siyah Üzüm', 'meyve'],
  ['Yeşil Üzüm', 'meyve'], ['İncir', 'meyve'], ['Nar', 'meyve'], ['Ayva', 'meyve'], ['Trabzon Hurması', 'meyve'],
  ['Avokado', 'meyve'], ['Kivi', 'meyve'], ['Ananas', 'meyve'], ['Mango', 'meyve'], ['Böğürtlen', 'meyve'],
  ['Ahududu', 'meyve'], ['Yaban Mersini', 'meyve'], ['Ceviz İçi', 'meyve'], ['Fındık', 'meyve'], ['Kestane', 'meyve'],
];

async function seedProduce(catIds) {
  let created = 0;
  for (const [name, cat] of PRODUCE) {
    const slug = slugifyTr(name);
    const exists = await prisma.product.findFirst({ where: { tenantId: T, slug } });
    if (exists) continue;
    await prisma.product.create({
      data: { tenantId: T, slug, name, categoryId: catIds[cat] ?? null, kind: 'SIMPLE', saleType: 'WEIGHT', unitLabel: 'kg', isActive: false },
    });
    created++;
  }
  return created;
}

// Rakipler (grup → işletmeler). Fiyat girişi panelden yapılır.
const COMPETITOR_GROUPS = [
  { name: 'Hızlı Teslimat', sortOrder: 1, members: ['Getir', 'Yemeksepeti', 'Trendyol', 'Banabi'] },
  { name: 'Zincir Market', sortOrder: 2, members: ['Migros', 'Carrefour'] },
  { name: 'İndirim Market', sortOrder: 3, members: ['BİM', 'A101', 'ŞOK'] },
];

async function seedCompetitors() {
  let groups = 0;
  let comps = 0;
  for (const g of COMPETITOR_GROUPS) {
    const group = await prisma.competitorGroup.upsert({
      where: { tenantId_name: { tenantId: T, name: g.name } },
      create: { tenantId: T, name: g.name, sortOrder: g.sortOrder },
      update: { sortOrder: g.sortOrder },
    });
    groups++;
    for (const name of g.members) {
      const exists = await prisma.competitor.findFirst({ where: { tenantId: T, name } });
      if (!exists) {
        await prisma.competitor.create({ data: { tenantId: T, name, groupId: group.id, isActive: true } });
        comps++;
      }
    }
  }
  return { groups, comps };
}

async function main() {
  // Maliyet bileşeni (GLOBAL)
  await prisma.costComponent.upsert({
    where: { tenantId_scope_refId: { tenantId: T, scope: 'GLOBAL', refId: '' } },
    create: { tenantId: T, scope: 'GLOBAL', refId: '', fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 },
    update: { fireRate: 0.15, labor: 120, packaging: 70, fuel: 50, commissionRate: 0.03 },
  });

  const catIds = {};
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: T, slug: c.slug } },
      create: { tenantId: T, ...c },
      update: { name: c.name },
    });
    catIds[c.slug] = row.id;
  }

  for (const p of PRODUCTS) {
    const { cat, ...rest } = p;
    await prisma.product.upsert({
      where: { tenantId_slug: { tenantId: T, slug: p.slug } },
      create: { tenantId: T, categoryId: catIds[cat], ...rest },
      update: { ...rest, categoryId: catIds[cat] },
    });
  }

  // Teslimat bölgeleri (ilçe)
  for (const name of ['Kadıköy', 'Üsküdar']) {
    await prisma.deliveryZone.upsert({
      where: { tenantId_name: { tenantId: T, name } },
      create: { tenantId: T, name },
      update: {},
    });
  }

  // Hazır sepet = ayrı bir ürün (kind=BASKET) + içeriği (yoksa)
  const hasBasket = await prisma.product.findFirst({ where: { tenantId: T, slug: 'haftalik-sebze' } });
  if (!hasBasket) {
    const dom = await prisma.product.findFirst({ where: { tenantId: T, slug: 'domates' } });
    const sal = await prisma.product.findFirst({ where: { tenantId: T, slug: 'salatalik' } });
    if (dom && sal) {
      await prisma.product.create({
        data: {
          tenantId: T, kind: 'BASKET', slug: 'haftalik-sebze', name: 'Haftalık Sebze Sepeti',
          saleType: 'PACK', unitLabel: 'paket', basePrice: 11000, discountedPrice: 9900, isFeatured: true,
          components: { create: [{ componentId: dom.id, qty: 2 }, { componentId: sal.id, qty: 3 }] },
        },
      });
    }
  }

  const produceCreated = await seedProduce(catIds);
  const c = await seedCompetitors();
  console.log(`Seed tamam: ${CATEGORIES.length} kategori, ${PRODUCTS.length} demo ürün, ${produceCreated} yeni hal ürünü (toplam katalog ${PRODUCE.length}), 1 hazır sepet, GLOBAL maliyet, ${c.groups} rakip grubu (${c.comps} yeni rakip).`);
}

main().finally(() => prisma.$disconnect());
