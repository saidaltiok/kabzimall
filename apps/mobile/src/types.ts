/** Storefront API tipleri — /api/v1/storefront/*. Para alanları kuruş (integer). */

export interface Category {
  slug: string;
  name: string;
}

export type SaleType = 'WEIGHT' | 'PIECE';

export interface Product {
  slug: string;
  name: string;
  saleType: SaleType;
  unitLabel: string; // "kg" | "adet"
  imageUrl: string | null;
  description: string | null;
  stockQty: number | null;
  maxPerOrder: number | null;
  basePrice: number; // kuruş
  discountedPrice: number | null; // kuruş
  isActive: boolean;
  originRegion: string | null;
  isFeatured: boolean;
  isFreshDaily: boolean;
  isLocal: boolean;
  category: Category;
  freshToday?: boolean;
  substitutes?: Product[];
}

export interface Basket {
  slug: string;
  name: string;
  basePrice: number;
  discountedPrice: number | null;
  imageUrl?: string | null;
  itemCount?: number;
  description?: string | null;
}

export interface Slot {
  date: string; // YYYY-MM-DD
  window: string; // HH:MM-HH:MM
  label: string;
  remaining: number | null;
}

export interface Zone {
  name: string;
}

export interface DeliveryTier {
  minSubtotal: number;
  fee: number;
}

export interface StoreSettings {
  minOrderTotal: number;
  deliveryTiers: DeliveryTier[];
  deliveryWindows: string[];
  slotCapacity: number | null;
  requireGeo: boolean;
  depotLat: number | null;
  depotLng: number | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  contactInstagram: string | null;
}

export interface Banner {
  id?: string;
  title: string;
  kicker?: string | null;
  subtitle?: string | null;
  couponCode?: string | null;
}

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  unitLabel?: string;
  unitPrice?: number;
  orderedQty: number;
  pickedQty?: number | null;
  note?: string | null;
  lineTotal?: number;
}

export interface Order {
  id: string;
  code: string;
  status: OrderStatus;
  subtotal: number;
  discountTotal?: number;
  deliveryFee?: number;
  // API birden çok toplam alanı döner: sipariş anı (grand/estimated) → paketleme (final).
  grandTotal?: number;
  estimatedTotal?: number;
  finalTotal?: number;
  items: OrderItem[];
  deliveryDate?: string | null;
  deliveryWindow?: string | null;
  createdAt: string;
  customerName?: string;
  substitutionPref?: 'CALL' | 'REMOVE' | 'SUBSTITUTE';
  paymentMethod?: string;
  rating?: number | null;
  ratingComment?: string | null;
}

// API durum akışı (order.status String; default CONFIRMED).
export type OrderStatus =
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface CouponResult {
  valid: boolean;
  discount: number; // kuruş
  message?: string;
  code?: string;
}
