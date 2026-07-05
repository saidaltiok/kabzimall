'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { dt } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { CUSTOMERS_TABS } from '@/components/SectionTabs';

interface Ticket {
  id: string; name: string; email: string | null; phone: string | null;
  orderCode: string | null; message: string; status: 'OPEN' | 'CLOSED';
  reply: string | null; repliedBy: string | null; createdAt: string;
}

export default function DestekPage() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<{ data: Ticket[]; meta: { open: number } }>('/admin/support')
      .then((r) => { setRows(r.data); setOpenCount(r.meta.open); })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send(t: Ticket, close: boolean) {
    setBusy(true); setError(null); setOk(null);
    try {
      await apiSend('PATCH', `/admin/support/${t.id}`, {
        reply: reply.trim() || undefined,
        status: close ? 'CLOSED' : undefined,
      });
      setOk(reply.trim() && t.email ? `✓ Yanıt e-postayla gönderildi: ${t.email}` : '✓ Güncellendi.');
      setReply(''); setOpen(null);
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Destek Talepleri" sub="Web iletişim formundan gelenler — yanıt müşteriye e-postayla gider" />
      <div className="body">
        <SectionTabs tabs={CUSTOMERS_TABS} />
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">Talepler <span>{openCount} açık / {rows.length} toplam</span></div>
          {rows.length === 0 ? (
            <p className="muted">Talep yok. 👍</p>
          ) : (
            <table>
              <thead>
                <tr><th>Zaman</th><th>Kimden</th><th>Mesaj</th><th>Sipariş</th><th>Durum</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <Fragment key={t.id}>
                    <tr style={t.status === 'CLOSED' ? { opacity: 0.55 } : undefined}>
                      <td className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{dt(t.createdAt)}</td>
                      <td><b>{t.name}</b><div className="muted" style={{ fontSize: 11 }}>{t.email ?? t.phone}</div></td>
                      <td style={{ maxWidth: 340 }}>{t.message.length > 90 ? t.message.slice(0, 90) + '…' : t.message}</td>
                      <td>{t.orderCode ?? '—'}</td>
                      <td>{t.status === 'OPEN' ? <span className="tagp risk">açık</span> : <span className="tagp ok">kapalı</span>}</td>
                      <td className="num">
                        <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setOpen(open === t.id ? null : t.id); setReply(''); }}>
                          {open === t.id ? 'Gizle' : 'Yanıtla'}
                        </button>
                      </td>
                    </tr>
                    {open === t.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--cream)' }}>
                          <div style={{ padding: '8px 4px', display: 'grid', gap: 8 }}>
                            <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.message}</div>
                            {t.reply && <div className="muted" style={{ fontSize: 12 }}>Önceki yanıt ({t.repliedBy}): {t.reply}</div>}
                            <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t.email ? 'Yanıtınız — e-postayla gönderilir…' : 'Not (müşterinin e-postası yok; telefonla arayın)…'} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, padding: 10, borderRadius: 10, border: '1px solid var(--line)' }} />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn" disabled={busy || !reply.trim()} onClick={() => send(t, false)}>Yanıtla</button>
                              <button className="btn ghost" disabled={busy} onClick={() => send(t, true)}>{reply.trim() ? 'Yanıtla + Kapat' : 'Kapat'}</button>
                              {t.status === 'CLOSED' && <button className="btn ghost" disabled={busy} onClick={() => apiSend('PATCH', `/admin/support/${t.id}`, { status: 'OPEN' }).then(load)}>Yeniden aç</button>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
