'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { tl } from '@/lib/format';
import Icon from './Icon';

interface Inbox {
  counts: { newOrders: number; slotRequests: number; openTickets: number; total: number };
  newOrders: { id: string; code: string; customerName: string; grandTotal: number; createdAt: string }[];
  slotRequests: { id: string; code: string; customerName: string; slotChangeDate: string | null; slotChangeWindow: string | null }[];
  openTickets: { id: string; name: string; orderCode: string | null; createdAt: string }[];
}

/** Bildirim zili — yeni sipariş, saat talebi, açık destek (30 sn'de bir tazelenir). */
export default function InboxBell() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(() => {
    apiGet<Inbox>('/admin/orders/inbox').then(setInbox).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => { clearInterval(t); document.removeEventListener('mousedown', onClick); };
  }, [load]);

  const total = inbox?.counts.total ?? 0;
  const go = (path: string) => { setOpen(false); router.push(path); };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Bildirimler"
        style={{ position: 'relative', border: '1px solid var(--line)', background: '#fff', borderRadius: 12, width: 38, height: 38, cursor: 'pointer', fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="bell" size={16} />
        {total > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--persimmon)', color: '#fff', borderRadius: 20, minWidth: 18, height: 18, fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 46, width: 330, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 20px 50px -20px rgba(0,0,0,.35)', zIndex: 60, overflow: 'hidden' }}>
          {!inbox || total === 0 ? (
            <div className="muted" style={{ padding: 16, fontSize: 13, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}><Icon name="check" size={14} /> Bekleyen bildirim yok</div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {inbox.slotRequests.length > 0 && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                  <b style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={14} /> Saat değişikliği talepleri ({inbox.counts.slotRequests})</b>
                  {inbox.slotRequests.map((r) => (
                    <div key={r.id} onClick={() => go('/siparisler')} style={{ fontSize: 12.5, padding: '5px 0', cursor: 'pointer' }}>
                      <b>{r.code}</b> · {r.customerName} → {r.slotChangeDate?.slice(5, 10)} {r.slotChangeWindow}
                    </div>
                  ))}
                </div>
              )}
              {inbox.newOrders.length > 0 && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                  <b style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="basket" size={14} /> Aksiyon bekleyen siparişler ({inbox.counts.newOrders})</b>
                  {inbox.newOrders.map((o) => (
                    <div key={o.id} onClick={() => go('/siparisler')} style={{ fontSize: 12.5, padding: '5px 0', cursor: 'pointer' }}>
                      <b>{o.code}</b> · {o.customerName} · {tl(o.grandTotal)}
                    </div>
                  ))}
                </div>
              )}
              {inbox.openTickets.length > 0 && (
                <div style={{ padding: '10px 14px' }}>
                  <b style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="headset" size={14} /> Açık destek talepleri ({inbox.counts.openTickets})</b>
                  {inbox.openTickets.map((t) => (
                    <div key={t.id} onClick={() => go('/destek')} style={{ fontSize: 12.5, padding: '5px 0', cursor: 'pointer' }}>
                      <b>{t.name}</b>{t.orderCode ? ` · ${t.orderCode}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
