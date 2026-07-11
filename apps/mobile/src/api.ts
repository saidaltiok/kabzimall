import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Product, Category, Basket, Slot, Zone, StoreSettings, Banner, Order, CouponResult,
} from './types';

/**
 * API tabanını çöz.
 * 1) EXPO_PUBLIC_API_BASE verilmişse onu kullan.
 * 2) Geliştirmede Metro host IP'sini kullan (Expo Go telefonda localhost'a erişemez).
 * 3) Aksi halde localhost.
 */
function resolveApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE;
  if (env) return env.replace(/\/$/, '');

  // Metro/Expo dev sunucusunun host adresi (ör. "192.168.1.20:8081").
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
    manifest?: { debuggerHost?: string };
  };
  const hostUri =
    c.expoConfig?.hostUri ||
    c.manifest2?.extra?.expoGo?.debuggerHost ||
    c.manifest?.debuggerHost;

  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:3001/api/v1`;
  }
  return 'http://localhost:3001/api/v1';
}

export const API_BASE = resolveApiBase();

/* ----------------------------- Oturum (müşteri OTP) ----------------------------- */

const TOKEN_KEY = 'km_customer_token';
const EMAIL_KEY = 'km_customer_email';

export async function getSession(): Promise<{ token: string; email: string } | null> {
  const [token, email] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(EMAIL_KEY),
  ]);
  return token && email ? { token, email } : null;
}

export async function setSession(token: string, email: string): Promise<void> {
  await AsyncStorage.multiSet([[TOKEN_KEY, token], [EMAIL_KEY, email]]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, EMAIL_KEY]);
}

/* ----------------------------- Fetch yardımcıları ----------------------------- */

async function handle(res: Response) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message ?? body?.error?.message ?? res.statusText;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return body;
}

async function req<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return handle(
    await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
}

export const apiGet = <T>(path: string, token?: string) => req<T>('GET', path, undefined, token);
export const apiPost = <T>(path: string, body: unknown, token?: string) => req<T>('POST', path, body, token);
export const apiPatch = <T>(path: string, body: unknown, token?: string) => req<T>('PATCH', path, body, token);
export const apiDelete = <T>(path: string, token?: string) => req<T>('DELETE', path, undefined, token);

/* ----------------------------- Vitrin (public) ----------------------------- */

export const getCategories = () =>
  apiGet<{ data: Category[] }>('/storefront/categories').then((r) => r.data);

export const getProducts = (params?: { search?: string; category?: string }) => {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.category) q.set('category', params.category);
  const qs = q.toString();
  return apiGet<{ data: Product[] }>(`/storefront/products${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const getProduct = (slug: string) => apiGet<Product>(`/storefront/products/${slug}`);

export const getBaskets = () =>
  apiGet<{ data: Basket[] }>('/storefront/baskets').then((r) => r.data);

export const getSlots = () => apiGet<{ data: Slot[] }>('/storefront/slots').then((r) => r.data);

export const getZones = () => apiGet<{ data: Zone[] }>('/storefront/zones').then((r) => r.data);

export const getSettings = () => apiGet<StoreSettings>('/storefront/settings');

export const getBanners = () =>
  apiGet<{ data: Banner[] }>('/storefront/banners').then((r) => r.data);

export const checkCoupon = (code: string, subtotalKurus: number) =>
  apiGet<CouponResult>(`/storefront/coupons/check?code=${encodeURIComponent(code)}&subtotal=${subtotalKurus}`);

/* ----------------------------- Sipariş ----------------------------- */

export interface CreateOrderPayload {
  items: { slug: string; qty: number; note?: string }[];
  customer: {
    name: string; phone: string; address: string;
    district?: string; email?: string; lat?: number; lng?: number;
  };
  slot?: { date: string; window: string };
  note?: string;
  substitutionPref?: 'CALL' | 'REMOVE' | 'SUBSTITUTE';
  couponCode?: string;
  paymentMethod?: 'COD' | 'CASH' | 'CARD';
}

export const createOrder = (payload: CreateOrderPayload) =>
  apiPost<Order>('/storefront/orders', payload);

export const getOrder = (id: string) => apiGet<Order>(`/storefront/orders/${id}`);

export const lookupOrder = (code: string, phone: string) =>
  apiGet<Order>(`/storefront/orders/lookup?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);

export const cancelOrder = (id: string) =>
  apiPost<Order>(`/storefront/orders/${id}/cancel`, {});

export const requestSlotChange = (id: string, date: string, window: string) =>
  apiPost<Order>(`/storefront/orders/${id}/slot-change`, { date, window });

/** Teslim sonrası puan (1-5, tek sefer). */
export const rateOrder = (id: string, rating: number, comment?: string) =>
  apiPost<{ ok: boolean; rating: number }>(`/storefront/orders/${id}/rating`, { rating, comment });

export const ISSUE_REASONS: { key: string; label: string }[] = [
  { key: 'EKSIK', label: 'Eksik ürün' },
  { key: 'EZIK_CURUK', label: 'Ezik / çürük ürün' },
  { key: 'YANLIS_URUN', label: 'Yanlış ürün' },
  { key: 'DIGER', label: 'Diğer' },
];

export interface IssueResult {
  resolved?: boolean;
  couponCode?: string;
  amount?: number; // otomatik telafi kuponu tutarı (kuruş)
  message?: string; // sunucudan hazır kullanıcı mesajı
  ok?: boolean;
}

/** Teslim sonrası sorun bildir (24 saat): kalem(ler) + sebep + opsiyonel mesaj. */
export const reportIssue = (id: string, itemIds: string[], reason: string, message?: string) =>
  apiPost<IssueResult>(`/storefront/orders/${id}/issue`, { itemIds, reason, message });

/* ----------------------------- Müşteri girişi ----------------------------- */

export const requestOtp = (email: string) =>
  apiPost<{ ok: boolean }>('/storefront/auth/request-otp', { email });

export const verifyOtp = (email: string, code: string) =>
  apiPost<{ accessToken: string }>('/storefront/auth/verify-otp', { email, code });

export const myOrders = (token: string) =>
  apiGet<{ email: string; data: Order[]; meta: { total: number } }>('/storefront/my-orders', token);

/* ---------------- Adreslerim (müşteri token'ı gerekir) ---------------- */

export interface SavedAddress {
  id: string; label: string; name: string; phone: string;
  addressText: string; district: string | null; lat: number; lng: number; isDefault: boolean;
}
export type AddressInput = Omit<SavedAddress, 'id' | 'isDefault'> & { isDefault?: boolean };

export const listAddresses = (token: string) =>
  apiGet<{ data: SavedAddress[] }>('/storefront/addresses', token).then((r) => r.data);
export const createAddress = (token: string, body: AddressInput) =>
  apiPost<SavedAddress>('/storefront/addresses', body, token);
export const deleteAddress = (token: string, id: string) =>
  apiDelete<{ ok?: boolean }>(`/storefront/addresses/${id}`, token);

/* ---------------- Destek / iletişim ---------------- */

export const sendSupport = (body: { name: string; email: string; orderCode?: string; message: string }) =>
  apiPost<{ ok?: boolean; id?: string }>('/storefront/support', body);
