'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface CartItem {
  slug: string;
  name: string;
  unitPrice: number; // kuruş
  unitLabel: string | null;
  emoji: string;
  qty: number;
}

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'km_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* yoksay */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartCtx['add'] = (item, qty = 1) =>
    setItems((cur) => {
      const i = cur.findIndex((x) => x.slug === item.slug);
      if (i === -1) return [...cur, { ...item, qty }];
      const next = [...cur];
      next[i] = { ...next[i], qty: +(next[i].qty + qty).toFixed(3) };
      return next;
    });

  const setQty: CartCtx['setQty'] = (slug, qty) =>
    setItems((cur) => (qty <= 0 ? cur.filter((x) => x.slug !== slug) : cur.map((x) => (x.slug === slug ? { ...x, qty } : x))));

  const remove: CartCtx['remove'] = (slug) => setItems((cur) => cur.filter((x) => x.slug !== slug));
  const clear = () => setItems([]);

  const count = items.reduce((a, b) => a + b.qty, 0);
  const subtotal = items.reduce((a, b) => a + Math.round(b.unitPrice * b.qty), 0);

  return <Ctx.Provider value={{ items, count, subtotal, add, setQty, remove, clear }}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart, CartProvider içinde kullanılmalı');
  return c;
}
