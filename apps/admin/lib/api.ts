// Intelligence API istemcisi (tarayıcı tarafı). CORS API'de açık (main.ts cors:true).
import { getToken, clearSession } from './auth';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handle(res: Response) {
  if (res.status === 401 && typeof window !== 'undefined') {
    // Token geçersiz/yok → oturumu temizle, girişe yönlendir.
    clearSession();
    if (location.pathname !== '/login') location.href = '/login';
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message ?? body?.error?.message ?? res.statusText;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return body;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return handle(await fetch(`${API_BASE}${path}`, { cache: 'no-store', headers: { ...authHeaders() } }));
}

export async function apiSend<T = unknown>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return handle(
    await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
