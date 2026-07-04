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
}

export function clearCustomerSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return handle(
    await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
