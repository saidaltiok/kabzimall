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
// NOT: 'salatalik' kasıtlı olarak burada YOK — İBB'nin gerçek karşılığı
// 'salatalik-i' ile birleştirilip silindi (bkz. kabzimall-ibb-catalog-source
// belleği). Bu listeye slug eklerken önce gerçek katalogda (İBB) aynı
// üründen var mı kontrol et; varsa buraya EKLEME (upsert her seed'de geri getirir).
const PRODUCTS = [
  { slug: 'domates', name: 'Domates', cat: 'sebze', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 3590, stockQty: 50, isFreshDaily: true, imageUrl: img('Domates') },
  { slug: 'cilek', name: 'Çilek', cat: 'meyve', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 6400, stockQty: 3, isFreshDaily: true, isLocal: true, imageUrl: img('Cilek') },
  { slug: 'muz', name: 'Muz', cat: 'meyve', saleType: 'WEIGHT', unitLabel: 'kg', basePrice: 5200, stockQty: 0, imageUrl: img('Muz') },
];

// NOT: Gerçek meyve-sebze kataloğu artık İBB günlük fiyat import'undan gelir
// (IbbHalService.dailyAutoImport cron + admin "Tümünü içeri al"). Seed yalnızca
// dev/test için minimal demo ürünleri (yukarıdaki PRODUCTS) + sepeti kurar.

// Rakipler (grup → işletmeler). Fiyat girişi panelden yapılır.
const COMPETITOR_GROUPS = [
  { name: 'Hızlı Teslimat', sortOrder: 1, members: ['Getir', 'Yemeksepeti', 'Trendyol', 'Banabi'] },
  { name: 'Zincir Market', sortOrder: 2, members: ['Migros', 'Carrefour'] },
  { name: 'İndirim Market', sortOrder: 3, members: ['BİM', 'A101', 'ŞOK'] },
  // Resmî marketfiyati.org.tr kaynağında olan kooperatif (otomatik çekilir).
  { name: 'Kooperatif', sortOrder: 4, members: ['Tarım Kredi'] },
  // Yerel İstanbul zincirleri + Hepsiexpress (tarayıcı-destekli / elle).
  { name: 'Yerel Zincir', sortOrder: 5, members: ['Onur', 'Hakmar', 'Mopaş', 'Happy Center', 'Kim Market', 'Namlı', 'Hepsiexpress'] },
  // Online manav — taze meyve-sebzede en yakın direkt rakipler (tarayıcı-destekli).
  { name: 'Online Manav', sortOrder: 6, members: ['Sebze Reyonu', 'Tazedirekt', 'Sebze Meyve Dünyası', 'Taze Dükkan', 'Çiftçiden Eve', 'TazeMasa'] },
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

  // Hazır sepet = ayrı bir ürün (kind=BASKET) + içeriği (yoksa). salatalik-i İBB
  // import'undan gelir; henüz çekilmediyse sepet oluşturulmaz (aşağıdaki null-check).
  const hasBasket = await prisma.product.findFirst({ where: { tenantId: T, slug: 'haftalik-sebze' } });
  if (!hasBasket) {
    const dom = await prisma.product.findFirst({ where: { tenantId: T, slug: 'domates' } });
    const sal = await prisma.product.findFirst({ where: { tenantId: T, slug: 'salatalik-i' } });
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

  const c = await seedCompetitors();
  console.log(`Seed tamam: ${CATEGORIES.length} kategori, ${PRODUCTS.length} demo ürün, 1 hazır sepet, GLOBAL maliyet, ${c.groups} rakip grubu (${c.comps} yeni rakip). Gerçek katalog İBB import'undan gelir.`);
}

main().finally(() => prisma.$disconnect());
