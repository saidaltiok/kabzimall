'use client';

import { useEffect, useState } from 'react';
import { clearSession, getUser, type SessionUser } from '@/lib/auth';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Yönetici',
  PRICE_MANAGER: 'Fiyat yöneticisi',
  OPERATION: 'Operasyon',
  VIEWER: 'İzleyici',
};

export default function Topbar({ title, sub }: { title: string; sub?: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => setUser(getUser()), []);

  function logout() {
    clearSession();
    location.href = '/login';
  }

  const name = user?.name || user?.email?.split('@')[0] || 'Kullanıcı';
  const initial = name.charAt(0).toLocaleUpperCase('tr');

  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="who">
        <div className="meta">
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div className="role">{user ? (ROLE_LABELS[user.role] ?? user.role) : '—'}</div>
        </div>
        <div className="av">{initial}</div>
        <button className="btn ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={logout}>
          Çıkış
        </button>
      </div>
    </div>
  );
}
