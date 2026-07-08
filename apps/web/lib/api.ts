export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

async function handle(res: Response) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message ?? body?.error?.message ?? res.statusText;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return body;
}

export async function apiGet<T = unknown>(path: string, headers?: Record<string, string>): Promise<T> {
  return handle(await fetch(`${API_BASE}${path}`, { cache: 'no-store', headers }));
}

/* ---------------- Müşteri oturumu (e-posta OTP) ---------------- */

const TOKEN_KEY = 'km_customer_token';
const EMAIL_KEY = 'km_customer_email';

export function customerSession(): { token: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const email = localStorage.getItem(EMAIL_KEY);
  return token && email ? { token, email } : null;
}

export function setCustomerSession(token: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
  // Header gibi kalıcı bileşenler oturum değişimini anında yansıtsın.
  window.dispatchEvent(new Event('km-session'));
}

/* ---------------- Kupon (sepette uygulanır, siparişle gönderilir) ---------------- */

const COUPON_KEY = 'km_coupon';

export function savedCoupon(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(COUPON_KEY);
}
export function saveCoupon(code: string) { localStorage.setItem(COUPON_KEY, code); }
export function clearCoupon() { localStorage.removeItem(COUPON_KEY); }

export function clearCustomerSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  window.dispatchEvent(new Event('km-session'));
}

export async function apiPost<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return handle(
    await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

export async function apiPatch<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return handle(
    await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

export async function apiDelete<T = unknown>(path: string, headers?: Record<string, string>): Promise<T> {
  return handle(await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers }));
}

/* ---------------- Adreslerim (giriş gerektirir) ---------------- */

export interface SavedAddress {
  id: string; label: string; name: string; phone: string;
  addressText: string; district: string | null; lat: number; lng: number; isDefault: boolean;
}
export type AddressInput = Omit<SavedAddress, 'id' | 'isDefault'> & { isDefault?: boolean };

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

export const listAddresses = (token: string) =>
  apiGet<{ data: SavedAddress[] }>('/storefront/addresses', authHeader(token)).then((r) => r.data);
export const createAddress = (token: string, body: AddressInput) =>
  apiPost<SavedAddress>('/storefront/addresses', body, authHeader(token));
export const updateAddress = (token: string, id: string, body: Partial<AddressInput>) =>
  apiPatch<SavedAddress>(`/storefront/addresses/${id}`, body, authHeader(token));
export const deleteAddress = (token: string, id: string) =>
  apiDelete(`/storefront/addresses/${id}`, authHeader(token));
