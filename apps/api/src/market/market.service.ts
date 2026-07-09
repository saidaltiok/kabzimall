import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { deliveryFee, lineTotal, effectivePrice } from '../pricing-engine';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { dateOnly } from '../common/date';
import { CreateOrderDto, DELIVERY_WINDOWS } from './dto/create-order.dto';
import { optimize, haversineKm } from './route-optim';
import { MailService } from './mail.service';
import { CouponService } from './coupon.service';
import { CashService } from '../cash/cash.service';
import { CostComponentsService } from '../intel/cost-components/cost-components.service';

const DAY_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

interface DeliveryTier { minSubtotal: number; fee: number }

/** Mağaza ayarı yoksa kademeli teslimat tarifesi (kuruş). */
const DEFAULT_DELIVERY_TIERS: DeliveryTier[] = [
  { minSubtotal: 0, fee: 4990 },
  { minSubtotal: 40000, fee: 0 },
];

const fmtTL = (k: number) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

/** Sipariş durumu → müşteriye gidecek bildirim metni. */
const STATUS_MSG: Record<string, string> = {
  CONFIRMED: 'Siparişiniz onaylandı.',
  PREPARING: 'Siparişiniz hazırlanıyor.',
  READY: 'Siparişiniz hazır, yola çıkmak üzere.',
  OUT_FOR_DELIVERY: 'Siparişiniz yola çıktı, kurye yolda.',
  DELIVERED: 'Siparişiniz teslim edildi. Afiyet olsun!',
  CANCELLED: 'Siparişiniz iptal edildi.',
};

/** Müşteriye açık ürün alanları (maliyet/marj ASLA sızmaz). */
const PUBLIC_PRODUCT_SELECT = {
  slug: true,
  name: true,
  saleType: true,
  unitLabel: true,
  imageUrl: true,
  description: true,
  stockQty: true,
  maxPerOrder: true,
  basePrice: true,
  discountedPrice: true,
  isActive: true,
  originRegion: true,
  isFeatured: true,
  isFreshDaily: true,
  isLocal: true,
  createdAt: true,
  category: { select: { slug: true, name: true } },
} as const;

export const ORDER_STATUSES = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

/** Operasyon akışı sırası (iptal hariç). */
const STATUS_FLOW = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

/**
 * Durum geçişi geçerli mi? İleri atlama serbest (kanban tek adım ilerletir ama
 * liste dropdown'ı atlayabilir), bir kademe geri (teslim öncesi düzeltme) ve her
 * aşamada iptal serbest; DELIVERED yalnız iptale (kasa tersine döner); CANCELLED
 * terminaldir. Kritik olan para güvenliği (iade/kupon/mükerrer) ayrıca korunur.
 */
function canTransition(from: string, to: string): boolean {
  if (from === 'CANCELLED') return false;
  if (to === 'CANCELLED') return true;
  if (from === 'DELIVERED') return false; // teslim edildikten sonra yalnız iptal
  const fi = STATUS_FLOW.indexOf(from as (typeof STATUS_FLOW)[number]);
  const ti = STATUS_FLOW.indexOf(to as (typeof STATUS_FLOW)[number]);
  if (fi < 0 || ti < 0) return false;
  return ti > fi || ti === fi - 1; // ileri atlama ya da bir kademe geri
}

/** Aksiyon bekleyen (aktif) sipariş durumları. */
const ACTIVE_STATUSES = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;

/** Müşterinin kendi iptal edebileceği erken aşamalar (hazırlanmadan önce). */
const CUSTOMER_CANCELLABLE = ['CONFIRMED', 'PREPARING'] as const;

/** Bu ve altı stok "düşük" sayılır (dashboard uyarısı). */
const LOW_STOCK_THRESHOLD = 5;

/**
 * Çakışmaya dayanıklı sipariş kodu: zaman (4) + rastgele (3) base36 — aynı
 * milisaniyede iki satış UNIQUE ihlaline düşmesin (kod, transaction dışında üretilir).
 */
const orderCode = (prefix: string) =>
  prefix + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase();

/** OrderItem/Order tutar alanları Int32 — üstü sessiz taşma yerine 400. */
const MAX_TOTAL_KURUS = 2_000_000_000;

/** Tezgâh/sipariş ödeme yöntemleri. Yalnız NAKİT (ve web COD) kasadaki fiziksel
 *  çekmeceyi etkiler; kart/yemek kartı bankaya/karta gider → kasa bakiyesine GİRMEZ. */
export const POS_PAYMENT_METHODS = ['CASH', 'CARD', 'SETCARD', 'MULTINET', 'TOKENFLEX', 'EDENRED', 'METROPOL'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];
const CASH_METHODS = new Set(['CASH', 'COD']); // kasadaki nakdi hareket ettiren yöntemler
const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Nakit', CARD: 'Kredi/banka kartı', SETCARD: 'Setcard', MULTINET: 'Multinet',
  TOKENFLEX: 'Token Flex', EDENRED: 'Edenred', METROPOL: 'Metropol', COD: 'Kapıda ödeme',
};

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly coupons: CouponService,
    private readonly cash: CashService,
    private readonly costs: CostComponentsService,
  ) {}

  /* ----------------------------- Vitrin ------------------------------ */

  listCategories() {
    return this.prisma.category.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
    });
  }

  async listProducts(opts: { search?: string; category?: string }) {
    const [rows, freshRows] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          tenantId: DEV_TENANT_ID,
          kind: 'SIMPLE', // hazır sepetler ayrı bölümde
          isActive: true,
          basePrice: { not: null }, // fiyatı olmayan ürün vitrine çıkmaz
          ...(opts.search
            ? { OR: [{ name: { contains: opts.search, mode: 'insensitive' } }, { slug: { contains: opts.search, mode: 'insensitive' } }] }
            : {}),
          ...(opts.category ? { category: { slug: opts.category } } : {}),
        },
        orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
        select: PUBLIC_PRODUCT_SELECT,
      }),
      // Tazelik kanıtı: son 24 saatte hal ALIMI yapılan ürünler "bugün halden" rozeti alır.
      this.prisma.halPurchase.groupBy({
        by: ['productSlug'],
        where: { tenantId: DEV_TENANT_ID, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) }, productSlug: { not: null } },
        _max: { createdAt: true },
      }),
    ]);
    const freshSet = new Set(freshRows.map((f) => f.productSlug as string));
    return rows.map((p) => ({ ...p, freshToday: freshSet.has(p.slug) }));
  }

  async getProduct(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { tenantId: DEV_TENANT_ID, slug, isActive: true },
      select: {
        ...PUBLIC_PRODUCT_SELECT,
        substitutes: {
          orderBy: { sortOrder: 'asc' as const },
          select: { substitute: { select: { slug: true, name: true, unitLabel: true, basePrice: true, discountedPrice: true, stockQty: true, imageUrl: true, isActive: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException(`Ürün bulunamadı: ${slug}`);
    const { substitutes, ...rest } = p;
    // yalnız yayında + fiyatlı + stoğu olan ikameler müşteriye gösterilir
    return {
      ...rest,
      substitutes: substitutes
        .map((s) => s.substitute)
        .filter((s) => s.isActive && s.basePrice != null && s.basePrice > 0 && (s.stockQty == null || s.stockQty > 0)),
    };
  }

  /* ----------------------------- Ayarlar ----------------------------- */

  /** Gelen tarifeyi doğrula/normalize et: geçerli kademeler, artan eşik; boşsa varsayılan. */
  private normalizeTiers(raw: unknown): DeliveryTier[] {
    if (!Array.isArray(raw)) return DEFAULT_DELIVERY_TIERS;
    const tiers = (raw as DeliveryTier[])
      .filter((t) => t && typeof t.minSubtotal === 'number' && typeof t.fee === 'number' && t.minSubtotal >= 0 && t.fee >= 0)
      .map((t) => ({ minSubtotal: Math.round(t.minSubtotal), fee: Math.round(t.fee) }))
      .sort((a, b) => a.minSubtotal - b.minSubtotal);
    // En az bir 0+ temel kademe olsun (yoksa küçük sepetler ücretsiz görünür).
    if (!tiers.length) return DEFAULT_DELIVERY_TIERS;
    if (tiers[0].minSubtotal > 0) tiers.unshift({ minSubtotal: 0, fee: tiers[0].fee });
    return tiers;
  }

  /** Pencere listesi doğrula: "HH:MM-HH:MM"; boş/bozuksa varsayılan 3 pencere. */
  private normalizeWindows(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [...DELIVERY_WINDOWS];
    const ws = (raw as string[]).filter((w) => typeof w === 'string' && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(w));
    return ws.length ? ws.slice(0, 8) : [...DELIVERY_WINDOWS];
  }

  /** Mağaza ayarları (tenant başına tek satır; yoksa varsayılan). */
  async getStoreSettings() {
    const s = await this.prisma.storeSetting.findUnique({ where: { tenantId: DEV_TENANT_ID } });
    return {
      minOrderTotal: s?.minOrderTotal ?? 0,
      deliveryTiers: this.normalizeTiers(s?.deliveryTiers),
      deliveryWindows: this.normalizeWindows(s?.deliveryWindows),
      slotCapacity: s?.slotCapacity ?? null,
      requireGeo: s?.requireGeo ?? true,
      depotLat: s?.depotLat ?? null,
      depotLng: s?.depotLng ?? null,
      contactPhone: s?.contactPhone ?? null,
      contactWhatsapp: s?.contactWhatsapp ?? null,
      contactEmail: s?.contactEmail ?? null,
      contactAddress: s?.contactAddress ?? null,
      contactInstagram: s?.contactInstagram ?? null,
    };
  }

  /** Verilen alanları günceller; verilmeyenler korunur. */
  async updateStoreSettings(patch: { minOrderTotal?: number; deliveryTiers?: DeliveryTier[]; deliveryWindows?: string[]; slotCapacity?: number | null; requireGeo?: boolean; depotLat?: number | null; depotLng?: number | null; contactPhone?: string | null; contactWhatsapp?: string | null; contactEmail?: string | null; contactAddress?: string | null; contactInstagram?: string | null }) {
    const cur = await this.getStoreSettings();
    const next = {
      minOrderTotal: patch.minOrderTotal ?? cur.minOrderTotal,
      deliveryTiers: patch.deliveryTiers ? this.normalizeTiers(patch.deliveryTiers) : cur.deliveryTiers,
      deliveryWindows: patch.deliveryWindows ? this.normalizeWindows(patch.deliveryWindows) : cur.deliveryWindows,
      slotCapacity: patch.slotCapacity !== undefined ? patch.slotCapacity : cur.slotCapacity,
      requireGeo: patch.requireGeo !== undefined ? patch.requireGeo : cur.requireGeo,
      depotLat: patch.depotLat !== undefined ? patch.depotLat : cur.depotLat,
      depotLng: patch.depotLng !== undefined ? patch.depotLng : cur.depotLng,
      contactPhone: patch.contactPhone !== undefined ? patch.contactPhone : cur.contactPhone,
      contactWhatsapp: patch.contactWhatsapp !== undefined ? patch.contactWhatsapp : cur.contactWhatsapp,
      contactEmail: patch.contactEmail !== undefined ? patch.contactEmail : cur.contactEmail,
      contactAddress: patch.contactAddress !== undefined ? patch.contactAddress : cur.contactAddress,
      contactInstagram: patch.contactInstagram !== undefined ? patch.contactInstagram : cur.contactInstagram,
    };
    const tiersJson = next.deliveryTiers as unknown as Prisma.InputJsonValue;
    const s = await this.prisma.storeSetting.upsert({
      where: { tenantId: DEV_TENANT_ID },
      create: { tenantId: DEV_TENANT_ID, minOrderTotal: next.minOrderTotal, deliveryTiers: tiersJson, deliveryWindows: next.deliveryWindows, slotCapacity: next.slotCapacity, requireGeo: next.requireGeo, depotLat: next.depotLat, depotLng: next.depotLng, contactPhone: next.contactPhone, contactWhatsapp: next.contactWhatsapp, contactEmail: next.contactEmail, contactAddress: next.contactAddress, contactInstagram: next.contactInstagram },
      update: { minOrderTotal: next.minOrderTotal, deliveryTiers: tiersJson, deliveryWindows: next.deliveryWindows, slotCapacity: next.slotCapacity, requireGeo: next.requireGeo, depotLat: next.depotLat, depotLng: next.depotLng, contactPhone: next.contactPhone, contactWhatsapp: next.contactWhatsapp, contactEmail: next.contactEmail, contactAddress: next.contactAddress, contactInstagram: next.contactInstagram },
    });
    return { minOrderTotal: s.minOrderTotal, deliveryTiers: this.normalizeTiers(s.deliveryTiers), deliveryWindows: this.normalizeWindows(s.deliveryWindows), slotCapacity: s.slotCapacity, requireGeo: s.requireGeo, depotLat: s.depotLat, depotLng: s.depotLng, contactPhone: s.contactPhone, contactWhatsapp: s.contactWhatsapp, contactEmail: s.contactEmail, contactAddress: s.contactAddress, contactInstagram: s.contactInstagram };
  }

  /**
   * Günlük dağıtım rota optimizasyonu: verilen teslimat gününün, harita konumu
   * olan siparişlerini depodan başlayıp en kısa turla sıralar (nearest-neighbor
   * + 2-opt, haversine). Konumsuz siparişler ayrıca döner (rotaya giremez).
   */
  async optimizeRoute(dateStr?: string) {
    const where: Prisma.OrderWhereInput = {
      tenantId: DEV_TENANT_ID,
      status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] },
      ...(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? { deliveryDate: new Date(`${dateStr}T00:00:00.000Z`) } : {}),
    };
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true, code: true, customerName: true, customerPhone: true, addressText: true, lat: true, lng: true, grandTotal: true, deliveryWindow: true },
    });

    const withGeo = orders.filter((o): o is typeof o & { lat: number; lng: number } => o.lat != null && o.lng != null);
    const noGeo = orders.filter((o) => o.lat == null || o.lng == null).map((o) => ({ id: o.id, code: o.code, customerName: o.customerName, addressText: o.addressText }));

    const settings = await this.getStoreSettings();
    const depot = { lat: settings.depotLat ?? 41.0082, lng: settings.depotLng ?? 28.9784 };

    const stops = withGeo.map((o) => ({ lat: o.lat, lng: o.lng }));
    const { order, distanceKm } = optimize(depot, stops);

    let prev = depot;
    const route = order.map((idx, seq) => {
      const o = withGeo[idx];
      const legKm = haversineKm(prev, { lat: o.lat, lng: o.lng });
      prev = { lat: o.lat, lng: o.lng };
      return { seq: seq + 1, orderId: o.id, code: o.code, customerName: o.customerName, customerPhone: o.customerPhone, addressText: o.addressText, deliveryWindow: o.deliveryWindow, grandTotal: o.grandTotal, lat: o.lat, lng: o.lng, legKm: Math.round(legKm * 100) / 100 };
    });

    // Kaba süre tahmini: 25 km/sa ort. şehir içi + durak başına 5 dk servis.
    const estMinutes = Math.round((distanceKm / 25) * 60 + route.length * 5);
    // Google Maps çoklu durak yol tarifi (depot → duraklar → depot).
    const pts = [`${depot.lat},${depot.lng}`, ...route.map((r) => `${r.lat},${r.lng}`), `${depot.lat},${depot.lng}`];
    const googleMapsUrl = `https://www.google.com/maps/dir/${pts.join('/')}`;

    return { date: dateStr ?? null, depot, stops: route.length, distanceKm: Math.round(distanceKm * 100) / 100, estMinutes, route, noGeo, googleMapsUrl };
  }

  /* --------------------------- Teslimat bölgesi -------------------------- */

  listActiveZones() {
    return this.prisma.deliveryZone.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true }, orderBy: { name: 'asc' }, select: { name: true } });
  }

  adminListZones() {
    return this.prisma.deliveryZone.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: { name: 'asc' } });
  }

  async createZone(name: string) {
    try {
      return await this.prisma.deliveryZone.create({ data: { tenantId: DEV_TENANT_ID, name: name.trim() } });
    } catch {
      throw new BadRequestException('Bu ilçe zaten ekli');
    }
  }

  async removeZone(id: string) {
    const z = await this.prisma.deliveryZone.findFirst({ where: { id, tenantId: DEV_TENANT_ID } }).catch(() => null);
    if (!z) throw new NotFoundException(`Bölge bulunamadı: ${id}`);
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true };
  }

  /** Yayındaki hazır sepetler — her biri kendi fiyatlı AYRI ürün + içeriği. */
  async listBaskets() {
    const rows = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, kind: 'BASKET', isActive: true, basePrice: { not: null } },
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
      select: {
        slug: true, name: true, unitLabel: true, imageUrl: true, basePrice: true, discountedPrice: true, stockQty: true,
        components: { include: { component: { select: { slug: true, name: true, unitLabel: true } } } },
      },
    });
    return rows.map((b) => ({
      slug: b.slug,
      name: b.name,
      imageUrl: b.imageUrl,
      unitLabel: b.unitLabel,
      basePrice: b.basePrice,
      discountedPrice: b.discountedPrice,
      price: effectivePrice(b.basePrice as number, b.discountedPrice),
      stockQty: b.stockQty,
      components: b.components.map((c) => ({ slug: c.component.slug, name: c.component.name, unitLabel: c.component.unitLabel, qty: c.qty })),
    }));
  }

  /* --------------------------- Teslimat slotu --------------------------- */

  /**
   * Ertesi gün(ler) için teslimat slotları (sonraki 2 gün). Kapasite tanımlıysa
   * (Ayarlar → pencere başına azami sipariş) dolu pencereler LİSTEDEN DÜŞER —
   * createOrder/saat değişikliği aynı listeyi doğruladığından dolu slota
   * sipariş alınamaz. remaining: kalan kontenjan (null = sınırsız).
   */
  async availableSlots(): Promise<{ date: string; window: string; label: string; remaining: number | null }[]> {
    const settings = await this.getStoreSettings();
    const windows = settings.deliveryWindows;
    const capacity: number | null = settings.slotCapacity ?? null;

    // Pencere doluluğu: iptal hariç, tarih+pencere başına sipariş sayısı (tek sorgu).
    const usage = new Map<string, number>();
    if (capacity != null) {
      const from = new Date();
      from.setUTCHours(0, 0, 0, 0);
      const counts = await this.prisma.order.groupBy({
        by: ['deliveryDate', 'deliveryWindow'],
        where: { tenantId: DEV_TENANT_ID, status: { not: 'CANCELLED' }, deliveryDate: { gte: from }, deliveryWindow: { not: null } },
        _count: { _all: true },
      });
      for (const c of counts) {
        if (c.deliveryDate && c.deliveryWindow) usage.set(`${c.deliveryDate.toISOString().slice(0, 10)}|${c.deliveryWindow}`, c._count._all);
      }
    }

    const out: { date: string; window: string; label: string; remaining: number | null }[] = [];
    for (let off = 1; off <= 2; off++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + off);
      const date = d.toISOString().slice(0, 10);
      const dayLabel =
        off === 1
          ? 'Yarın'
          : `${DAY_TR[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      for (const w of windows) {
        const remaining = capacity != null ? Math.max(0, capacity - (usage.get(`${date}|${w}`) ?? 0)) : null;
        if (remaining === 0) continue; // dolu pencere satışa kapalı
        out.push({ date, window: w, label: `${dayLabel} ${w}`, remaining });
      }
    }
    return out;
  }

  /* ----------------------------- Sipariş ----------------------------- */

  async createOrder(dto: CreateOrderDto) {
    // Fiyatlar SUNUCUDA, anlık base_price'tan hesaplanır (istemciye güvenilmez).
    const slugs = [...new Set(dto.items.map((i) => i.slug))];
    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, slug: { in: slugs }, isActive: true },
      include: { components: { include: { component: { select: { id: true, name: true, stockQty: true, unitLabel: true } } } } },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    // Satış anı birim maliyeti (K/Z COGS tarihsel maliyetle hesaplansın).
    const costBySlug = new Map<string, number | null>(
      await Promise.all(slugs.map(async (s) => [s, (await this.costs.costForProduct(s).catch(() => null))?.directCost ?? null] as [string, number | null])),
    );

    const items = dto.items.map((i) => {
      const p = bySlug.get(i.slug);
      if (!p) throw new BadRequestException(`Ürün bulunamadı veya yayında değil: ${i.slug}`);
      if (p.basePrice == null) throw new BadRequestException(`Ürün fiyatlandırılmamış: ${i.slug}`);
      if (p.maxPerOrder != null && i.qty > p.maxPerOrder) {
        throw new BadRequestException(`Sipariş başına en fazla ${p.maxPerOrder} ${p.unitLabel ?? ''} alınabilir: ${p.name}`);
      }
      if (p.stockQty != null && i.qty > p.stockQty) {
        throw new BadRequestException(`Yeterli stok yok: ${p.name} (kalan ${p.stockQty} ${p.unitLabel ?? ''})`);
      }
      // Hazır sepet: içindeki ürünlerin stoğu da yetmeli.
      if (p.kind === 'BASKET') {
        for (const c of p.components) {
          if (c.component.stockQty != null && c.qty * i.qty > c.component.stockQty) {
            throw new BadRequestException(`Yeterli stok yok: ${c.component.name} (${p.name} içeriği, kalan ${c.component.stockQty})`);
          }
        }
      }
      const unitPrice = effectivePrice(p.basePrice, p.discountedPrice);
      return {
        productId: p.id,
        productName: p.name,
        unitLabel: p.unitLabel,
        unitPrice,
        orderedQty: i.qty,
        note: i.note?.trim() || null,
        lineTotal: lineTotal(unitPrice, i.qty),
        unitCostSnapshot: costBySlug.get(i.slug) ?? null,
      };
    });

    // Bölge doğrulama: hizmet ilçesi tanımlıysa, sipariş ilçesi listede olmalı.
    const zones = await this.prisma.deliveryZone.findMany({ where: { tenantId: DEV_TENANT_ID, isActive: true }, select: { name: true } });
    if (zones.length > 0) {
      const d = dto.customer.district?.trim();
      if (!d) throw new BadRequestException('Teslimat ilçesi gerekli');
      if (!zones.some((z) => z.name.toLowerCase() === d.toLowerCase())) {
        throw new BadRequestException(`Bu ilçeye teslimat yapılmıyor: ${d}`);
      }
    }

    // Slot doğrulama: yalnızca sunulan günlerden/pencerelerden biri kabul edilir.
    let deliveryDate: Date | null = null;
    let deliveryWindow: string | null = null;
    if (dto.slot) {
      const valid = (await this.availableSlots()).some((s) => s.date === dto.slot!.date && s.window === dto.slot!.window);
      if (!valid) throw new BadRequestException('Geçersiz teslimat slotu');
      deliveryDate = dateOnly(dto.slot.date);
      deliveryWindow = dto.slot.window;
    }

    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

    // Mağaza ayarları: asgari tutar + teslimat ücreti tarifesi.
    const settings = await this.getStoreSettings();
    if (settings.minOrderTotal > 0 && subtotal < settings.minOrderTotal) {
      throw new BadRequestException(`Asgari sipariş tutarı ${fmtTL(settings.minOrderTotal)}. Sepet ara toplamı: ${fmtTL(subtotal)}.`);
    }
    // Harita konumu zorunluysa (kurye adresi kesin bulsun): lat/lng gelmeli.
    if (settings.requireGeo && (dto.customer.lat == null || dto.customer.lng == null)) {
      throw new BadRequestException('Teslimat konumunu haritadan işaretleyin — kuryenin sizi bulması için gerekli.');
    }

    const fee = deliveryFee(subtotal, settings.deliveryTiers); // eşik indirim ÖNCESİ ara toplama göre (müşteri lehine)
    if (subtotal > MAX_TOTAL_KURUS) throw new BadRequestException('Sipariş tutarı çok büyük.');
    const code = orderCode('KM');

    // Sipariş oluşturma + stok düşme atomik (ürün + sepet içeriği).
    const created = await this.prisma.$transaction(async (tx) => {
      // Kupon: doğrulama + kullanım sayacı atomik (limit yarışı olmaz).
      let couponCode: string | null = null;
      let discountTotal = 0;
      if (dto.couponCode?.trim()) {
        const r = await this.coupons.redeem(tx, dto.couponCode, subtotal);
        couponCode = r.code;
        discountTotal = r.discount;
      }
      const grandTotal = subtotal - discountTotal + fee;
      for (const it of items) {
        const p = products.find((x) => x.id === it.productId)!;
        await this.adjustStock(tx, p, it.orderedQty, -1, code);
      }
      const order = await tx.order.create({
        data: {
          tenantId: DEV_TENANT_ID,
          code,
          customerName: dto.customer.name,
          customerPhone: dto.customer.phone,
          addressText: dto.customer.address,
          district: dto.customer.district ?? null,
          lat: dto.customer.lat ?? null,
          lng: dto.customer.lng ?? null,
          substitutionPref: dto.substitutionPref ?? 'CALL',
          customerEmail: dto.customer.email ?? null,
          note: dto.note ?? null,
          status: 'CONFIRMED',
          paymentMethod: dto.paymentMethod ?? 'COD',
          deliveryDate,
          deliveryWindow,
          subtotal,
          couponCode,
          discountTotal,
          deliveryFee: fee,
          grandTotal,
          estimatedTotal: grandTotal,
          items: { create: items },
        },
        include: { items: true },
      });
      await tx.orderStatusHistory.create({ data: { tenantId: DEV_TENANT_ID, orderId: order.id, fromStatus: null, toStatus: 'CONFIRMED', changedBy: 'müşteri', note: 'Sipariş alındı' } });
      await tx.notification.create({ data: { tenantId: DEV_TENANT_ID, orderId: order.id, message: 'Siparişiniz alındı. En kısa sürede hazırlanacak.' } });
      return order;
    });
    await this.emailCustomer(created.id, created.customerEmail, `Siparişiniz alındı (${created.code})`,
      `Merhaba ${dto.customer.name}, ${fmtTL(created.grandTotal)} tutarındaki ${created.code} kodlu siparişinizi aldık. ` +
      (created.deliveryWindow ? `Teslimat: ${created.deliveryDate?.toISOString().slice(0, 10)} ${created.deliveryWindow}. ` : '') +
      'Durumu sipariş sayfanızdan takip edebilirsiniz.');
    return created;
  }

  /**
   * Müşteriye e-posta (varsa) + EMAIL kanallı bildirim kaydı. SMTP yoksa log
   * modunda çalışır; hiçbir ana akışı bloklamaz/bozamaz.
   */
  private async emailCustomer(orderId: string, to: string | null | undefined, subject: string, text: string) {
    if (!to) return;
    await this.mail.send(to, subject, text);
    await this.prisma.notification
      .create({ data: { tenantId: DEV_TENANT_ID, orderId, channel: 'EMAIL', message: `${subject} → ${to}` } })
      .catch(() => {});
  }

  /**
   * Stok ayarı: ürünün kendi stoğu + (BASKET ise) içeriği. dir=-1 düş, +1 geri
   * yükle. Stok takipli her değişim harekete (StockMovement) iz bırakır.
   */
  private async adjustStock(
    tx: Prisma.TransactionClient,
    product: { id: string; stockQty: number | null; kind: string; components: { qty: number; component: { id: string; stockQty: number | null } }[] },
    qty: number,
    dir: 1 | -1,
    refCode?: string,
    reasonOverride?: string,
  ) {
    const reason = reasonOverride ?? (dir === -1 ? 'ORDER' : 'CANCEL');
    if (product.stockQty != null) {
      await tx.product.update({ where: { id: product.id }, data: { stockQty: { increment: dir * qty } } });
      await tx.stockMovement.create({ data: { tenantId: DEV_TENANT_ID, productId: product.id, delta: dir * qty, reason, refCode: refCode ?? null } });
    }
    if (product.kind === 'BASKET') {
      for (const c of product.components) {
        if (c.component.stockQty != null) {
          await tx.product.update({ where: { id: c.component.id }, data: { stockQty: { increment: dir * c.qty * qty } } });
          await tx.stockMovement.create({ data: { tenantId: DEV_TENANT_ID, productId: c.component.id, delta: dir * c.qty * qty, reason, refCode: refCode ?? null } });
        }
      }
    }
  }

  /**
   * Müşteriye dönen sipariş yanıtından İÇ alanları temizler: kalem maliyet
   * anlık görüntüsü (unitCostSnapshot), personel e-postaları (changedBy/createdBy)
   * ve 📌 dahili notlar. Admin uçları temizlenmemiş halini kullanır.
   */
  sanitizeForCustomer<T extends object>(order: T): T {
    const o = order as T & {
      items?: Record<string, unknown>[];
      statusHistory?: { note?: string | null; changedBy?: unknown }[];
      refunds?: { createdBy?: unknown }[];
    };
    return {
      ...o,
      ...(o.items ? { items: o.items.map(({ unitCostSnapshot: _c, ...it }) => it) } : {}),
      ...(o.statusHistory
        ? {
            statusHistory: o.statusHistory
              .filter((h) => !h.note?.startsWith('📌'))
              .map(({ changedBy: _b, ...h }) => h),
          }
        : {}),
      ...(o.refunds ? { refunds: o.refunds.map(({ createdBy: _b, ...r }) => r) } : {}),
    };
  }

  async getOrder(id: string) {
    const order = await this.prisma.order
      .findFirst({
        where: { id, tenantId: DEV_TENANT_ID },
        include: {
          items: {
            include: {
              product: {
                select: {
                  slug: true, // "tekrar sipariş" için
                  stockQty: true,
                  // paketleyiciye ikame önerisi (eksik üründe müşteri tercihiyle birlikte kullanılır)
                  substitutes: { orderBy: { sortOrder: 'asc' }, select: { substitute: { select: { slug: true, name: true, stockQty: true, isActive: true } } } },
                },
              },
            },
          },
          notifications: { orderBy: { createdAt: 'asc' } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
          refunds: { orderBy: { createdAt: 'asc' } },
        },
      })
      .catch(() => null);
    if (!order) throw new NotFoundException(`Sipariş bulunamadı: ${id}`);
    return order;
  }

  /**
   * Müşteri kendi siparişini iptal eder — yalnızca erken aşamada (hazırlanmadan/
   * yola çıkmadan önce). Stok geri yüklenir + bildirim üretilir (updateStatus üzerinden).
   */
  async cancelByCustomer(id: string) {
    const order = await this.getOrder(id);
    if (!CUSTOMER_CANCELLABLE.includes(order.status as (typeof CUSTOMER_CANCELLABLE)[number])) {
      throw new BadRequestException('Sipariş bu aşamada iptal edilemez. Lütfen bizimle iletişime geçin.');
    }
    return this.updateStatus(id, 'CANCELLED', 'müşteri');
  }

  /** Telefon eşleştirmesi için: yalnızca rakamlar, son 10 hane. */
  private normalizePhone(p: string) {
    const digits = (p ?? '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  /**
   * Misafir sipariş sorgulama: kod + telefon eşleşmeli (UUID gerekmez).
   * Güvenlik: ikisi de doğru olmadıkça hangi kısmın yanlış olduğu sızdırılmaz.
   */
  async lookupOrder(code: string, phone: string) {
    const c = (code ?? '').trim().toUpperCase();
    const ph = this.normalizePhone(phone);
    if (!c || ph.length < 7) throw new NotFoundException('Sipariş bulunamadı');
    const order = await this.prisma.order
      .findFirst({ where: { code: c, tenantId: DEV_TENANT_ID }, include: { items: true, notifications: { orderBy: { createdAt: 'asc' } } } })
      .catch(() => null);
    if (!order || this.normalizePhone(order.customerPhone) !== ph) {
      throw new NotFoundException('Sipariş bulunamadı. Kod ve telefon eşleşmiyor.');
    }
    return order;
  }

  /* -------------------------- Admin sipariş -------------------------- */

  listOrders(status?: string, q?: string) {
    const term = q?.trim();
    return this.prisma.order.findMany({
      where: {
        tenantId: DEV_TENANT_ID,
        channel: { not: 'POS' }, // tezgâh fişleri kendi ekranında (Tezgâh Satışı)
        ...(status ? { status } : {}),
        ...(term
          ? {
              OR: [
                { code: { contains: term, mode: 'insensitive' } },
                { customerName: { contains: term, mode: 'insensitive' } },
                { customerPhone: { contains: term } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300, // panel son 300 siparişi gösterir — eskilere arama/filtreyle inilir (bellek koruması)
      include: {
        items: {
          include: {
            // paketleyiciye ikame önerisi + eldeki stok
            product: {
              select: {
                stockQty: true,
                substitutes: { orderBy: { sortOrder: 'asc' }, select: { substitute: { select: { name: true, stockQty: true, isActive: true } } } },
              },
            },
          },
        },
        notifications: { orderBy: { createdAt: 'asc' } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  /** Panel dashboard'u için günün operasyon özeti (sipariş/ciro/durum + düşük stok). */
  async opsSummary() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [todays, active, lowStock] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId: DEV_TENANT_ID, createdAt: { gte: start } },
        select: { status: true, grandTotal: true, finalTotal: true, channel: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { tenantId: DEV_TENANT_ID, status: { in: [...ACTIVE_STATUSES] } },
        _count: { _all: true },
      }),
      this.prisma.product.findMany({
        where: { tenantId: DEV_TENANT_ID, isActive: true, stockQty: { lte: LOW_STOCK_THRESHOLD } },
        select: { slug: true, name: true, stockQty: true, unitLabel: true },
        orderBy: { stockQty: 'asc' },
        take: 20,
      }),
    ]);

    const ordersToday = todays.filter((o) => o.channel !== 'POS').length; // web siparişi sayısı
    const revenueToday = todays.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + (o.finalTotal ?? o.grandTotal), 0); // tezgâh dahil
    const posLive = todays.filter((o) => o.channel === 'POS' && o.status !== 'CANCELLED');
    const posToday = { count: posLive.length, revenue: posLive.reduce((s, o) => s + (o.finalTotal ?? o.grandTotal), 0) };
    const statusCounts = Object.fromEntries(ACTIVE_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    for (const a of active) statusCounts[a.status] = a._count._all;
    const activeCount = Object.values(statusCounts).reduce((s, n) => s + n, 0);

    return { ordersToday, revenueToday, posToday, activeCount, statusCounts, lowStock };
  }

  /**
   * Paketleme: tartılan gerçek gramajları işler; satır ve toplam kesinleşir
   * (estimated → final). lineTotal packages/pricing'ten. Sipariş 'READY' olur.
   */
  async packOrder(id: string, items: { itemId: string; pickedQty: number }[], actor?: string) {
    const order = await this.getOrder(id);
    // Para güvenliği: tahsilat sonrası finalTotal değişemez (iade tavanı buna dayanır).
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
      throw new BadRequestException('Teslim edilmiş/iptal edilmiş sipariş yeniden paketlenemez.');
    }
    if (order.refunds.length > 0) {
      throw new BadRequestException('Kısmi iadesi olan sipariş yeniden paketlenemez (iade tavanı bozulur).');
    }
    const picked = new Map(items.map((i) => [i.itemId, i.pickedQty]));
    for (const pi of items) {
      if (!order.items.some((it) => it.id === pi.itemId)) {
        throw new BadRequestException(`Kalem bu siparişe ait değil: ${pi.itemId}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let finalSubtotal = 0;
      for (const it of order.items) {
        const qty = picked.get(it.id) ?? it.pickedQty ?? it.orderedQty;
        const lt = lineTotal(it.unitPrice, qty);
        finalSubtotal += lt;
        if (picked.has(it.id)) {
          await tx.orderItem.update({ where: { id: it.id }, data: { pickedQty: picked.get(it.id)!, lineTotal: lt } });
        }
      }
      // Kupon: PERCENT gerçek gramaja ölçeklenir, FIXED sabit kalır.
      const discount = await this.coupons.recompute(order.couponCode, order.discountTotal, finalSubtotal);
      const finalTotal = finalSubtotal - discount + order.deliveryFee;
      const updated = await tx.order.update({ where: { id }, data: { finalTotal, discountTotal: discount, status: 'READY' }, include: { items: true } });
      await tx.orderStatusHistory.create({ data: { tenantId: DEV_TENANT_ID, orderId: id, fromStatus: order.status, toStatus: 'READY', changedBy: actor ?? null, note: `Paketlendi · ${fmtTL(finalTotal)}` } });
      await tx.notification.create({ data: { tenantId: DEV_TENANT_ID, orderId: id, message: `Siparişiniz paketlendi. Kesinleşen tutar: ${fmtTL(finalTotal)}.` } });
      return updated;
    });
  }

  async updateStatus(id: string, status: string, actor?: string) {
    if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
      throw new BadRequestException(`Geçersiz durum: ${status}`);
    }
    const order = await this.getOrder(id);
    if (status === order.status) return order; // idempotent no-op
    if (!canTransition(order.status, status)) {
      throw new BadRequestException(`Geçersiz durum geçişi: ${order.status} → ${status}`);
    }

    const cancelling = status === 'CANCELLED'; // order.status !== CANCELLED garanti (yukarıda no-op)
    const wasDelivered = order.status === 'DELIVERED';
    const refunded = order.refunds.reduce((s, r) => s + r.amount, 0);
    if (cancelling && refunded > 0) {
      // Çifte iade/çifte stok koruması: kısmi iade başladıysa tam iptal kapalı.
      throw new BadRequestException('Kısmi iadesi olan sipariş iptal edilemez — kalan tutarı kısmi iadeyle geri ödeyin.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status } });
      await tx.orderStatusHistory.create({ data: { tenantId: DEV_TENANT_ID, orderId: id, fromStatus: order.status, toStatus: status, changedBy: actor ?? null } });
      await tx.notification.create({ data: { tenantId: DEV_TENANT_ID, orderId: id, message: STATUS_MSG[status] ?? `Durum: ${status}` } });
      if (cancelling) {
        // Stok iadesi (sipariş anındaki miktarla — düşümle simetrik).
        const prods = await tx.product.findMany({
          where: { id: { in: order.items.map((i) => i.productId) } },
          include: { components: { include: { component: { select: { id: true, stockQty: true } } } } },
        });
        const byId = new Map(prods.map((p) => [p.id, p]));
        for (const it of order.items) {
          const p = byId.get(it.productId);
          if (p) await this.adjustStock(tx, p, it.orderedQty, 1, order.code);
        }
        // Kupon kullanım hakkı iadesi (tekrar kullanılabilsin).
        await this.coupons.releaseUsage(tx, order.couponCode);
      }
    });
    // Teslim → kasaya GİRİŞ; teslim SONRASI iptal → kasadan ÇIKIŞ (tahsilat iadesi).
    // YALNIZ nakit/COD kasadaki çekmeceyi etkiler; kart/yemek kartı bankaya gider.
    const cashPaid = CASH_METHODS.has(order.paymentMethod);
    if (status === 'DELIVERED' && cashPaid) {
      await this.cash.recordSale(order.code, order.finalTotal ?? order.grandTotal);
    } else if (cancelling && wasDelivered && cashPaid) {
      await this.cash.recordSaleReversal(order.code, order.finalTotal ?? order.grandTotal);
    }
    await this.emailCustomer(id, order.customerEmail, `Sipariş güncellemesi (${order.code})`, STATUS_MSG[status] ?? `Durum: ${status}`);
    return this.getOrder(id);
  }

  /** Doğrulanmış e-postayla verilen siparişler ("Siparişlerim" — cihazdan bağımsız). */
  myOrders(email: string) {
    return this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, customerEmail: email },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: { include: { product: { select: { slug: true } } } } }, // slug: "sık aldıkların" rafı için
    });
  }

  /**
   * Panel bildirim merkezi (zil) — mevcut verilerden türetilir, ayrı tablo yok:
   * yeni (aksiyon bekleyen) siparişler, bekleyen saat talepleri, açık destek.
   */
  async adminInbox() {
    const [newOrders, slotRequests, openTickets] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId: DEV_TENANT_ID, status: 'CONFIRMED', channel: { not: 'POS' } },
        orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, code: true, customerName: true, grandTotal: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { tenantId: DEV_TENANT_ID, slotChangeStatus: 'PENDING', channel: { not: 'POS' } },
        orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, code: true, customerName: true, slotChangeDate: true, slotChangeWindow: true },
      }),
      this.prisma.supportTicket.findMany({
        where: { tenantId: DEV_TENANT_ID, status: 'OPEN' },
        orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, name: true, orderCode: true, createdAt: true },
      }),
    ]);
    return {
      counts: { newOrders: newOrders.length, slotRequests: slotRequests.length, openTickets: openTickets.length, total: newOrders.length + slotRequests.length + openTickets.length },
      newOrders, slotRequests, openTickets,
    };
  }

  /* ------------------------ Tezgâh satışı (POS) ----------------------- */

  /**
   * Tezgâh satışı: dükkânda tartılıp nakit tahsil edilen satış. Order olarak
   * (channel=POS, doğuştan DELIVERED) kaydedilir ki stok, kasa, ciro ve K/Z
   * tek para yolundan aksın. Stok fiziksel gerçeğe uyar: kayıt yetersizse satış
   * ENGELLENMEZ — eksiye düşer ve uyarı döner (kayıt hatası görünür olsun).
   * İade = mevcut iptal yolu (stok geri + SALE_REVERSAL).
   */
  async posSale(dto: { items: { slug: string; qty: number; unitPrice?: number }[]; note?: string; paymentMethod?: PosPaymentMethod }, actor?: string) {
    if (!dto?.items?.length) throw new BadRequestException('En az bir kalem gerekli.');
    const payment: PosPaymentMethod = dto.paymentMethod ?? 'CASH';
    const slugs = [...new Set(dto.items.map((i) => i.slug))];
    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, slug: { in: slugs }, isActive: true },
      include: { components: { include: { component: { select: { id: true, name: true, stockQty: true, unitLabel: true } } } } },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    // Satış anı birim maliyeti (K/Z COGS web siparişiyle aynı biçimde).
    const costBySlug = new Map<string, number | null>(
      await Promise.all(slugs.map(async (s) => [s, (await this.costs.costForProduct(s).catch(() => null))?.directCost ?? null] as [string, number | null])),
    );

    // Aynı ürün birden çok satırda olabilir (farklı fiyatla pazarlık) — stok/uyarı ürün başına TOPLAM üzerinden.
    const qtyBySlug = new Map<string, number>();
    for (const i of dto.items) qtyBySlug.set(i.slug, (qtyBySlug.get(i.slug) ?? 0) + i.qty);

    const items = dto.items.map((i) => {
      const p = bySlug.get(i.slug);
      if (!p) throw new BadRequestException(`Ürün bulunamadı veya yayında değil: ${i.slug}`);
      const unitPrice = i.unitPrice ?? (p.basePrice != null ? effectivePrice(p.basePrice, p.discountedPrice) : null);
      if (unitPrice == null) throw new BadRequestException(`Ürün fiyatlandırılmamış — satır fiyatı girerek sat: ${p.name}`);
      return {
        productId: p.id, productName: p.name, unitLabel: p.unitLabel,
        unitPrice, orderedQty: i.qty, pickedQty: i.qty,
        lineTotal: lineTotal(unitPrice, i.qty),
        unitCostSnapshot: costBySlug.get(i.slug) ?? null,
      };
    });
    const warnings: string[] = [];
    for (const [slug, qty] of qtyBySlug) {
      const p = bySlug.get(slug)!;
      if (p.stockQty != null && qty > p.stockQty) {
        warnings.push(`${p.name}: stok kaydı ${p.stockQty} ${p.unitLabel ?? ''} iken ${qty} satıldı — stok eksiye düştü, kaydı düzelt.`);
      }
    }
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    if (subtotal <= 0) throw new BadRequestException('Satış tutarı 0 olamaz.');
    if (subtotal > MAX_TOTAL_KURUS) throw new BadRequestException('Satış tutarı çok büyük.');
    const code = orderCode('TZG');

    const created = await this.prisma.$transaction(async (tx) => {
      for (const [slug, qty] of qtyBySlug) {
        await this.adjustStock(tx, bySlug.get(slug)!, qty, -1, code, 'POS');
      }
      const order = await tx.order.create({
        data: {
          tenantId: DEV_TENANT_ID, code, channel: 'POS',
          customerName: 'Tezgâh satışı', customerPhone: '', addressText: '—',
          status: 'DELIVERED', paymentMethod: payment,
          note: dto.note?.trim() || null,
          subtotal, discountTotal: 0, deliveryFee: 0,
          grandTotal: subtotal, estimatedTotal: subtotal, finalTotal: subtotal,
          items: { create: items },
        },
        include: { items: true },
      });
      await tx.orderStatusHistory.create({
        data: { tenantId: DEV_TENANT_ID, orderId: order.id, fromStatus: null, toStatus: 'DELIVERED', changedBy: actor ?? 'tezgâh', note: `🧾 Tezgâh satışı — ${PAYMENT_LABEL[payment] ?? payment} ${fmtTL(subtotal)}` },
      });
      return order;
    });
    // Tahsilat kasaya YALNIZ nakitse düşer (kart/yemek kartı bankaya gider → çekmece bakiyesini şişirmesin).
    if (CASH_METHODS.has(payment)) await this.cash.recordSale(created.code, subtotal);
    return { ...created, warnings, paymentMethod: payment };
  }

  /** Bugünün tezgâh fişleri + toplamı (iptal edilenler listede kalır, toplama girmez). */
  async posToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sales = await this.prisma.order.findMany({
      where: { tenantId: DEV_TENANT_ID, channel: 'POS', createdAt: { gte: start } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, status: true, finalTotal: true, grandTotal: true, createdAt: true, note: true, paymentMethod: true,
        items: { select: { productName: true, orderedQty: true, unitLabel: true, lineTotal: true } },
      },
    });
    const live = sales.filter((s) => s.status !== 'CANCELLED');
    const total = live.reduce((a, s) => a + (s.finalTotal ?? s.grandTotal), 0);
    // Ödeme yöntemine göre kırılım (nakit / kart / yemek kartı) — kasa mutabakatı için.
    const byMethod: Record<string, number> = {};
    for (const s of live) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + (s.finalTotal ?? s.grandTotal);
    return { total, count: live.length, byMethod, sales };
  }

  /** Dahili personel notu — durum geçmişine düşer (📌 önekli), müşteri bildirimine GİRMEZ. */
  async addInternalNote(id: string, note: string, actor?: string) {
    const trimmed = note?.trim();
    if (!trimmed) throw new BadRequestException('Not boş olamaz.');
    const order = await this.getOrder(id);
    await this.prisma.orderStatusHistory.create({
      data: { tenantId: DEV_TENANT_ID, orderId: id, fromStatus: order.status, toStatus: order.status, changedBy: actor ?? null, note: `📌 ${trimmed.slice(0, 300)}` },
    });
    return this.getOrder(id);
  }

  /* -------------------------- Kısmi iade ----------------------------- */

  /**
   * Kalem bazlı kısmi iade (yalnız DELIVERED): seçili kalemler (kg üründe kısmi
   * miktar olabilir) nakit (kasadan SALE_REVERSAL) ya da tek kullanımlık kuponla
   * geri ödenir. Toplam iadeler tahsilatı aşamaz. restock=true ise ürünler stoğa
   * döner (çürük/fire için false bırak). K-Z net ciroyu bu kayıtlardan düşer.
   */
  async refundOrder(
    id: string,
    dto: { items: { itemId: string; qty?: number }[]; method: 'CASH' | 'COUPON'; restock?: boolean; reason?: string },
    actor?: string,
  ) {
    const order = await this.getOrder(id);
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException('Kısmi iade yalnız teslim edilmiş siparişte yapılabilir (öncesinde iptal kullanın).');
    }
    if (!dto?.items?.length) throw new BadRequestException('En az bir kalem seçin.');

    const byId = new Map(order.items.map((it) => [it.id, it]));
    const lines = dto.items.map((sel) => {
      const it = byId.get(sel.itemId);
      if (!it) throw new BadRequestException(`Kalem bu siparişe ait değil: ${sel.itemId}`);
      const fullQty = it.pickedQty ?? it.orderedQty;
      const qty = sel.qty ?? fullQty;
      if (!(qty > 0) || qty > fullQty + 1e-9) {
        throw new BadRequestException(`Geçersiz iade miktarı: ${it.productName} (en fazla ${fullQty} ${it.unitLabel ?? ''})`);
      }
      // Satır tutarından oranla (tartı sonrası kesinleşen tutar esas alınır).
      const amount = Math.abs(qty - fullQty) < 1e-9 ? it.lineTotal : Math.round(Number(((it.lineTotal * qty) / fullQty).toPrecision(12)));
      return { itemId: it.id, productId: it.productId, productName: it.productName, qty, amount };
    });
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length) {
      throw new BadRequestException('Aynı kalem birden çok kez seçilemez.');
    }

    const total = lines.reduce((s, l) => s + l.amount, 0);
    const paid = order.finalTotal ?? order.grandTotal;
    if (total <= 0) throw new BadRequestException('İade tutarı 0 olamaz.');

    // Çifte tazmin koruması: otomatik telafi kuponu verilmiş siparişe ikinci
    // kupon verilmez (nakit serbest — panel notuna uyarı düşer, karar personelin).
    const telafi = await this.prisma.supportTicket.findFirst({
      where: { tenantId: DEV_TENANT_ID, orderCode: order.code, status: 'CLOSED', repliedBy: 'otomatik', message: { startsWith: '[SORUN' } },
    });
    if (telafi && dto.method === 'COUPON') {
      throw new BadRequestException('Bu siparişe otomatik telafi kuponu zaten verilmiş — çifte kupon yerine nakit iade kullanın (ya da önce kuponu pasifleştirin).');
    }

    const reason = dto.reason?.trim().slice(0, 300) || null;
    const couponCode = dto.method === 'COUPON' ? `IADE-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : null;

    const refund = await this.prisma.$transaction(async (tx) => {
      // Tavan kontrolü ATOMİK: sipariş satırı kilitlenir (eşzamanlı iki iade
      // birbirini göremeden tavanı aşamaz), toplam kilit altında yeniden okunur.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const agg = await tx.orderRefund.aggregate({ _sum: { amount: true }, where: { tenantId: DEV_TENANT_ID, orderId: id } });
      const already = agg._sum.amount ?? 0;
      if (already + total > paid) {
        throw new BadRequestException(`İade toplamı tahsilatı aşamaz: ödenen ${fmtTL(paid)}, önceki iadeler ${fmtTL(already)}, istenen ${fmtTL(total)}.`);
      }
      const r = await tx.orderRefund.create({
        data: {
          tenantId: DEV_TENANT_ID, orderId: id, amount: total, method: dto.method,
          couponCode, reason, restock: !!dto.restock, createdBy: actor ?? null,
          items: lines.map(({ itemId, productName, qty, amount }) => ({ itemId, productName, qty, amount })),
        },
      });
      if (couponCode) {
        await tx.coupon.create({ data: { tenantId: DEV_TENANT_ID, code: couponCode, type: 'FIXED', value: total, minSubtotal: 0, maxUses: 1 } });
      }
      if (dto.restock) {
        const prods = await tx.product.findMany({
          where: { id: { in: lines.map((l) => l.productId) } },
          include: { components: { include: { component: { select: { id: true, stockQty: true } } } } },
        });
        const prodById = new Map(prods.map((p) => [p.id, p]));
        for (const l of lines) {
          const p = prodById.get(l.productId);
          if (p) await this.adjustStock(tx, p, l.qty, 1, order.code, 'REFUND');
        }
      }
      const summary = lines.map((l) => `${l.productName} ${l.qty}`).join(', ');
      await tx.orderStatusHistory.create({
        data: {
          tenantId: DEV_TENANT_ID, orderId: id, fromStatus: order.status, toStatus: order.status, changedBy: actor ?? null,
          note: `↩ Kısmi iade ${fmtTL(total)} (${dto.method === 'CASH' ? 'nakit' : `kupon ${couponCode}`}) — ${summary}${reason ? ` · ${reason}` : ''}${telafi ? ' · ⚠ bu siparişe telafi kuponu da verilmişti' : ''}`,
        },
      });
      await tx.notification.create({
        data: {
          tenantId: DEV_TENANT_ID, orderId: id,
          message: dto.method === 'CASH'
            ? `${fmtTL(total)} iade edildi (nakit). Özür dileriz, afiyet olsun!`
            : `${fmtTL(total)} değerinde iade kuponunuz: ${couponCode} — bir sonraki siparişinizde kullanın.`,
        },
      });
      return r;
    });
    // Nakit iade kasadan düşer (kasa kapalıysa askıda bekler); kupon kasaya dokunmaz.
    if (dto.method === 'CASH') await this.cash.recordRefund(refund.id, total, order.code);
    await this.emailCustomer(id, order.customerEmail, `İade işlendi (${order.code})`,
      dto.method === 'CASH'
        ? `${fmtTL(total)} tutarındaki iadeniz nakit olarak işlendi.`
        : `${fmtTL(total)} değerinde tek kullanımlık iade kuponunuz: ${couponCode}`);
    return this.getOrder(id);
  }

  /* --------------------- Puanlama & sorun bildirimi --------------------- */

  /** Teslim edilen siparişe 1-5 puan (tek sefer). ≤2 puan otomatik destek kaydı açar. */
  async rateOrder(id: string, rating: number, comment?: string) {
    const order = await this.getOrder(id);
    if (order.status !== 'DELIVERED') throw new BadRequestException('Yalnız teslim edilen sipariş puanlanabilir.');
    if (order.rating != null) throw new BadRequestException('Bu sipariş zaten puanlandı.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestException('Puan 1-5 arası olmalı.');
    const c = comment?.trim().slice(0, 500) || null;
    await this.prisma.order.update({ where: { id }, data: { rating, ratingComment: c } });
    if (rating <= 2) {
      // Düşük puan sessiz kalmasın — destek kuyruğuna düşür.
      await this.prisma.supportTicket.create({
        data: {
          tenantId: DEV_TENANT_ID, name: order.customerName, phone: order.customerPhone,
          email: order.customerEmail, orderCode: order.code,
          message: `[DÜŞÜK PUAN ${rating}/5] ${c ?? 'Yorum bırakılmadı.'}`,
        },
      }).catch(() => {});
    }
    return { ok: true, rating };
  }

  private static readonly ISSUE_REASONS: Record<string, string> = {
    EKSIK: 'Eksik ürün', EZIK_CURUK: 'Ezik/çürük ürün', YANLIS_URUN: 'Yanlış ürün', DIGER: 'Diğer',
  };
  /** Otomatik telafi üst sınırı (kuruş) — üstü destek kuyruğuna düşer. */
  private static readonly AUTO_CREDIT_LIMIT = 10000;

  /**
   * Self-servis sorun bildirimi (teslimden sonra 24 saat): kalem seç + sebep.
   * Etkilenen tutar ≤ 100₺ ise ANINDA tek kullanımlık telafi kuponu üretilir
   * (kapıda ödemede para iadesi yok — kredi doğal çözüm); üstü destek kuyruğuna düşer.
   */
  async reportIssue(id: string, dto: { itemIds: string[]; reason: string; message?: string }) {
    const order = await this.getOrder(id);
    if (order.status !== 'DELIVERED') throw new BadRequestException('Sorun bildirimi teslim edilen siparişler içindir.');
    const deliveredAt = [...order.statusHistory].reverse().find((h) => h.toStatus === 'DELIVERED')?.createdAt;
    if (!deliveredAt || Date.now() - deliveredAt.getTime() > 24 * 3_600_000) {
      throw new BadRequestException('Sorun bildirimi teslimattan sonraki 24 saat içinde yapılabilir — lütfen İletişim sayfasından bize ulaşın.');
    }
    const reasonLabel = MarketService.ISSUE_REASONS[dto.reason];
    if (!reasonLabel) throw new BadRequestException(`Geçersiz sebep. Sebepler: ${Object.keys(MarketService.ISSUE_REASONS).join(', ')}`);
    const items = order.items.filter((it) => dto.itemIds?.includes(it.id));
    if (items.length === 0) throw new BadRequestException('En az bir ürün seçin.');

    // Aynı sipariş için tek bildirim (mükerrer kredi engeli).
    const existing = await this.prisma.supportTicket.findFirst({
      where: { tenantId: DEV_TENANT_ID, orderCode: order.code, message: { startsWith: '[SORUN' } },
    });
    if (existing) throw new BadRequestException('Bu sipariş için zaten bir sorun bildirimi var — destek ekibimiz ilgileniyor.');

    const affected = items.reduce((s, it) => s + it.lineTotal, 0);
    const detail = `[SORUN: ${reasonLabel}] Ürünler: ${items.map((i) => i.productName).join(', ')} (${fmtTL(affected)}). ${dto.message?.trim().slice(0, 500) ?? ''}`;

    if (affected <= MarketService.AUTO_CREDIT_LIMIT) {
      // Anında telafi: tek kullanımlık sabit tutar kuponu.
      const code = `TELAFI-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await this.prisma.coupon.create({
        data: { tenantId: DEV_TENANT_ID, code, type: 'FIXED', value: affected, minSubtotal: 0, maxUses: 1 },
      });
      await this.prisma.supportTicket.create({
        data: {
          tenantId: DEV_TENANT_ID, name: order.customerName, phone: order.customerPhone, email: order.customerEmail,
          orderCode: order.code, message: detail, status: 'CLOSED',
          reply: `Otomatik telafi kuponu verildi: ${code} (${fmtTL(affected)})`, repliedBy: 'otomatik',
        },
      });
      await this.prisma.notification.create({
        data: { tenantId: DEV_TENANT_ID, orderId: id, message: `Sorun bildiriminiz için özür dileriz. ${fmtTL(affected)} değerinde telafi kuponunuz: ${code} — bir sonraki siparişinizde sepette kullanın.` },
      });
      await this.emailCustomer(id, order.customerEmail, `Telafi kuponunuz (${order.code})`, `Bildirdiğiniz sorun için özür dileriz. ${fmtTL(affected)} değerinde tek kullanımlık kuponunuz: ${code}`);
      return { resolved: true, couponCode: code, amount: affected, message: `Özür dileriz! ${fmtTL(affected)} değerinde telafi kuponun hazır: ${code}` };
    }

    await this.prisma.supportTicket.create({
      data: {
        tenantId: DEV_TENANT_ID, name: order.customerName, phone: order.customerPhone, email: order.customerEmail,
        orderCode: order.code, message: detail,
      },
    });
    await this.prisma.notification.create({
      data: { tenantId: DEV_TENANT_ID, orderId: id, message: 'Sorun bildiriminiz alındı — en kısa sürede sizi arayacağız.' },
    });
    return { resolved: false, amount: affected, message: 'Bildiriminiz alındı — tutar incelemesi için ekibimiz en kısa sürede dönüş yapacak.' };
  }

  /* ---------------------- Teslimat saati değişikliği ---------------------- */

  /**
   * Müşteri teslimat saatini değiştirmek İSTER (onay akışı): yalnız sipariş
   * henüz hazırlanmaya başlamadıysa (CONFIRMED). Talep siparişe "bekliyor"
   * olarak işlenir; admin onaylayınca gerçek slot güncellenir ve müşteri
   * bilgilendirilir. Yeni talep, bekleyen talebin üzerine yazar.
   */
  async requestSlotChange(id: string, date: string, window: string) {
    const order = await this.getOrder(id);
    if (order.status !== 'CONFIRMED') {
      throw new BadRequestException('Siparişiniz hazırlanmaya başladı; teslimat saati artık değiştirilemez.');
    }
    const valid = (await this.availableSlots()).some((s) => s.date === date && s.window === window);
    if (!valid) throw new BadRequestException('Geçersiz teslimat saati.');
    const sameAsCurrent = order.deliveryDate?.toISOString().slice(0, 10) === date && order.deliveryWindow === window;
    if (sameAsCurrent) throw new BadRequestException('Siparişiniz zaten bu teslimat saatinde.');

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { slotChangeDate: dateOnly(date), slotChangeWindow: window, slotChangeStatus: 'PENDING' },
      }),
      this.prisma.notification.create({
        data: { tenantId: DEV_TENANT_ID, orderId: id, message: `Teslimat saati değişikliği talebiniz alındı: ${date} ${window}. Onaylandığında bilgilendirileceksiniz.` },
      }),
    ]);
    return this.getOrder(id);
  }

  /** Admin karar verir: onayda slot gerçekten değişir, redde mevcut saat kalır — iki durumda da müşteri bilgilendirilir. */
  async decideSlotChange(id: string, approve: boolean, actor?: string) {
    const order = await this.getOrder(id);
    if (order.slotChangeStatus !== 'PENDING' || !order.slotChangeDate || !order.slotChangeWindow) {
      throw new BadRequestException('Bu siparişte bekleyen teslimat saati talebi yok.');
    }
    const reqDate = order.slotChangeDate.toISOString().slice(0, 10);
    const reqLabel = `${reqDate} ${order.slotChangeWindow}`;
    const curLabel = `${order.deliveryDate?.toISOString().slice(0, 10) ?? '—'} ${order.deliveryWindow ?? ''}`.trim();

    const message = approve
      ? `Teslimat saatiniz güncellendi: ${reqLabel}.`
      : `Teslimat saati değişikliği talebiniz onaylanamadı; mevcut saatiniz (${curLabel}) geçerli.`;

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: {
          ...(approve ? { deliveryDate: order.slotChangeDate, deliveryWindow: order.slotChangeWindow } : {}),
          slotChangeDate: null,
          slotChangeWindow: null,
          slotChangeStatus: null,
        },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          tenantId: DEV_TENANT_ID, orderId: id, fromStatus: order.status, toStatus: order.status,
          changedBy: actor ?? null,
          note: approve ? `Teslimat saati güncellendi: ${curLabel} → ${reqLabel}` : `Saat değişikliği reddedildi (talep: ${reqLabel})`,
        },
      }),
      this.prisma.notification.create({ data: { tenantId: DEV_TENANT_ID, orderId: id, message } }),
    ]);
    await this.emailCustomer(id, order.customerEmail, `Teslimat saati (${order.code})`, message);
    return this.getOrder(id);
  }
}
