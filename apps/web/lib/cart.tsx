'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface CartItem {
  slug: string;
  name: string;
  unitPrice: number; // kuruş (sepet indirimi uygulanmışsa indirimli)
  unitLabel: string | null;
  emoji: string;
  qty: number;
  note?: string; // müşteri ürün notu
  basketSlug?: string; // bir hazır sepetten geldiyse
  basketName?: string;
}

/** Aynı ürün hem normal hem sepetten gelebilir → bileşik kimlik. */
const keyOf = (slug: string, basketSlug?: string) => `${slug}|${basketSlug ?? ''}`;

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  setNote: (key: string, note: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  keyOf: (slug: string, basketSlug?: string) => string;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'km_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* yoksay */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(items)); // yükleme bitmeden yazma (race önleme)
  }, [items, loaded]);

  const add: CartCtx['add'] = (item, qty = 1) =>
    setItems((cur) => {
      const k = keyOf(item.slug, item.basketSlug);
      const i = cur.findIndex((x) => keyOf(x.slug, x.basketSlug) === k);
      if (i === -1) return [...cur, { ...item, qty }];
      const next = [...cur];
      next[i] = { ...next[i], qty: +(next[i].qty + qty).toFixed(3) };
      return next;
    });

  const setQty: CartCtx['setQty'] = (key, qty) =>
    setItems((cur) => (qty <= 0 ? cur.filter((x) => keyOf(x.slug, x.basketSlug) !== key) : cur.map((x) => (keyOf(x.slug, x.basketSlug) === key ? { ...x, qty } : x))));

  const setNote: CartCtx['setNote'] = (key, note) =>
    setItems((cur) => cur.map((x) => (keyOf(x.slug, x.basketSlug) === key ? { ...x, note: note.trim() || undefined } : x)));

  const remove: CartCtx['remove'] = (key) => setItems((cur) => cur.filter((x) => keyOf(x.slug, x.basketSlug) !== key));
  const clear = () => setItems([]);

  const count = items.reduce((a, b) => a + b.qty, 0);
  const subtotal = items.reduce((a, b) => a + Math.round(b.unitPrice * b.qty), 0);

  return <Ctx.Provider value={{ items, count, subtotal, add, setQty, setNote, remove, clear, keyOf }}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart, CartProvider içinde kullanılmalı');
  return c;
}
