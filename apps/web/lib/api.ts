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

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return handle(await fetch(`${API_BASE}${path}`, { cache: 'no-store' }));
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
