import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSession, setSession as persist, clearSession as wipe } from './api';

interface SessionState {
  token: string | null;
  email: string | null;
  ready: boolean;
  signIn: (token: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSession()
      .then((s) => { if (s) { setToken(s.token); setEmail(s.email); } })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (t: string, e: string) => {
    await persist(t, e);
    setToken(t); setEmail(e);
  }, []);

  const signOut = useCallback(async () => {
    await wipe();
    setToken(null); setEmail(null);
  }, []);

  return <Ctx.Provider value={{ token, email, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession, SessionProvider içinde kullanılmalı');
  return ctx;
}
