'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Favoriler — cihazda tutulur (localStorage), üyelik gerektirmez.
 * Bileşenler arası eşitleme 'km-favs' custom event'iyle (Header rozeti vb.).
 */
const FAVS_KEY = 'km_favs';
const FAVS_EVENT = 'km-favs';

function readFavs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function useFavs() {
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    setFavs(readFavs());
    const sync = () => setFavs(readFavs());
    window.addEventListener(FAVS_EVENT, sync);
    window.addEventListener('storage', sync); // başka sekmede değişirse
    return () => {
      window.removeEventListener(FAVS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback((slug: string) => {
    const cur = readFavs();
    const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
    localStorage.setItem(FAVS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(FAVS_EVENT));
  }, []);

  const isFav = useCallback((slug: string) => favs.includes(slug), [favs]);

  return { favs, isFav, toggle };
}
