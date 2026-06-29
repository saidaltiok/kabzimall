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

  // Hazır sepet (yoksa)
  const hasBasket = await prisma.basketTemplate.findFirst({ where: { tenantId: T, slug: 'haftalik-sebze' } });
  if (!hasBasket) {
    const dom = await prisma.product.findFirst({ where: { tenantId: T, slug: 'domates' } });
    const sal = await prisma.product.findFirst({ where: { tenantId: T, slug: 'salatalik' } });
    if (dom && sal) {
      await prisma.basketTemplate.create({
        data: {
          tenantId: T, slug: 'haftalik-sebze', name: 'Haftalık Sebze Sepeti',
          description: '4 kişilik · domates + salatalık',
          items: { create: [{ productId: dom.id, qty: 2 }, { productId: sal.id, qty: 3 }] },
        },
      });
    }
  }

  console.log(`Seed tamam: ${CATEGORIES.length} kategori, ${PRODUCTS.length} ürün, 1 hazır sepet, GLOBAL maliyet.`);
}

main().finally(() => prisma.$disconnect());
