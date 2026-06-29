// Misafir sipariş geçmişi (tarayıcıda). Giriş yok; verilen siparişlerin id'leri
// localStorage'da tutulur ki müşteri "Siparişlerim"den takip edebilsin.
const KEY = 'km_orders';

export interface OrderRef {
  id: string;
  code: string;
}

export function getOrderHistory(): OrderRef[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function rememberOrder(id: string, code: string): void {
  const cur = getOrderHistory();
  if (cur.some((o) => o.id === id)) return;
  localStorage.setItem(KEY, JSON.stringify([{ id, code }, ...cur].slice(0, 20)));
}
