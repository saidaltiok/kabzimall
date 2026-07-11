import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Favoriler — cihazda tutulur (AsyncStorage), üyelik gerektirmez.
 * Web vitriniyle aynı anahtar/mantık (km_favs, slug listesi).
 */
const FAVS_KEY = 'km_favs';

interface FavState {
  favs: string[];
  ready: boolean;
  isFav: (slug: string) => boolean;
  toggle: (slug: string) => void;
  count: number;
}

const Ctx = createContext<FavState | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favs, setFavs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(FAVS_KEY)
      .then((raw) => {
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setFavs(arr.filter((s): s is string => typeof s === 'string'));
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(FAVS_KEY, JSON.stringify(favs)).catch(() => {});
  }, [favs, ready]);

  const toggle = useCallback((slug: string) => {
    setFavs((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
  }, []);

  const isFav = useCallback((slug: string) => favs.includes(slug), [favs]);

  return (
    <Ctx.Provider value={{ favs, ready, isFav, toggle, count: favs.length }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFavorites(): FavState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFavorites, FavoritesProvider içinde kullanılmalı');
  return ctx;
}
