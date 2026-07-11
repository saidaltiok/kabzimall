import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CartLine {
  slug: string;
  name: string;
  emoji: string;
  unitLabel: string; // "kg" | "adet"
  saleType: 'WEIGHT' | 'PIECE';
  unitPrice: number; // kuruş / birim
  qty: number; // kg ya da adet (tartılıda ondalık)
  note?: string; // müşteri ürün notu (paketleyene iletilir)
  isBasket?: boolean;
}

interface CartState {
  lines: CartLine[];
  ready: boolean;
  add: (line: Omit<CartLine, 'qty'>, qty: number, note?: string) => void;
  setQty: (slug: string, qty: number) => void;
  step: (slug: string, dir: 1 | -1) => void;
  setNote: (slug: string, note: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
  count: number; // farklı ürün (satır) sayısı
  subtotal: number; // kuruş
}

const CartCtx = createContext<CartState | null>(null);
const STORAGE_KEY = 'km_cart_v1';

/** Tartılıda 0,5 kg; adetli üründe 1 adım. */
export const stepSize = (saleType: 'WEIGHT' | 'PIECE') => (saleType === 'WEIGHT' ? 0.5 : 1);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setLines(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lines)).catch(() => {});
  }, [lines, ready]);

  const round = (n: number) => Math.round(n * 1000) / 1000;

  const add: CartState['add'] = (line, qty, note) => {
    setLines((cur) => {
      const i = cur.findIndex((l) => l.slug === line.slug);
      if (i >= 0) {
        const next = [...cur];
        // Aynı ürün tekrar eklenince miktarı artır; yeni not verildiyse güncelle.
        next[i] = { ...next[i], qty: round(next[i].qty + qty), note: note?.trim() || next[i].note };
        return next;
      }
      return [...cur, { ...line, qty: round(qty), note: note?.trim() || undefined }];
    });
  };

  const setQty: CartState['setQty'] = (slug, qty) => {
    setLines((cur) =>
      cur
        .map((l) => (l.slug === slug ? { ...l, qty: round(Math.max(0, qty)) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const step: CartState['step'] = (slug, dir) => {
    setLines((cur) =>
      cur
        .map((l) => (l.slug === slug ? { ...l, qty: round(l.qty + dir * stepSize(l.saleType)) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const setNote: CartState['setNote'] = (slug, note) => {
    setLines((cur) =>
      cur.map((l) => (l.slug === slug ? { ...l, note: note.trim() || undefined } : l)),
    );
  };

  const remove: CartState['remove'] = (slug) =>
    setLines((cur) => cur.filter((l) => l.slug !== slug));

  const clear = () => setLines([]);

  const count = lines.length;
  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + Math.round(l.unitPrice * l.qty), 0),
    [lines],
  );

  const value: CartState = { lines, ready, add, setQty, step, setNote, remove, clear, count, subtotal };
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useCart, CartProvider içinde kullanılmalı');
  return ctx;
}
