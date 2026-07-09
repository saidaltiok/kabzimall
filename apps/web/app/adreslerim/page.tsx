'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  apiGet, customerSession, clearCustomerSession,
  listAddresses, createAddress, updateAddress, deleteAddress,
  type SavedAddress, type AddressInput,
} from '@/lib/api';
import Modal from '@/components/Modal';
import CustomerLogin from '@/components/CustomerLogin';
import AddressForm from '@/components/AddressForm';
import Icon from '@/components/Icon';

export default function AddressesPage() {
  const [session, setSession] = useState<{ token: string; email: string } | null | undefined>(undefined);
  const [items, setItems] = useState<SavedAddress[] | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(customerSession());
    apiGet<{ data: { name: string }[] }>('/storefront/zones').then((r) => setZones(r.data.map((z) => z.name))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    try { setItems(await listAddresses(session.token)); }
    catch (e) {
      // Oturum düşmüş olabilir.
      if (String((e as Error).message).includes('Oturum') || String((e as Error).message).includes('Giriş')) {
        clearCustomerSession(); setSession(null);
      } else setError((e as Error).message);
    }
  }, [session]);
  useEffect(() => { load(); }, [load]);

  async function save(a: AddressInput) {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      if (editing) await updateAddress(session.token, editing.id, a);
      else await createAddress(session.token, a);
      setFormOpen(false); setEditing(null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(a: SavedAddress) {
    if (!session || !window.confirm(`"${a.label}" adresini silmek istiyor musun?`)) return;
    setBusy(true); setError(null);
    try { await deleteAddress(session.token, a.id); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function makeDefault(a: SavedAddress) {
    if (!session || a.isDefault) return;
    setBusy(true); setError(null);
    try { await updateAddress(session.token, a.id, { isDefault: true }); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (session === undefined) return <div className="loading">Yükleniyor…</div>;

  if (!session) {
    return (
      <>
        <h1 className="h1">Adreslerim</h1>
        <CustomerLogin title="Adreslerini görmek için giriş yap" onDone={() => setSession(customerSession())} />
        <p style={{ textAlign: 'center', marginTop: 16 }}><Link href="/" className="back">← Alışverişe dön</Link></p>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 className="h1" style={{ margin: '24px 0 16px' }}>Adreslerim</h1>
        <button className="cta" style={{ marginTop: 0, marginLeft: 'auto', width: 'auto', padding: '10px 16px' }} onClick={() => { setEditing(null); setFormOpen(true); }}>
          + Yeni adres
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 2px 16px' }}>
        Giriş: <b>{session.email}</b> · Kayıtlı adreslerin her cihazdan görünür, ödeme adımında tek dokunuşla seçilir.
        <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--berry)', fontSize: 12.5, marginLeft: 8 }} onClick={() => { clearCustomerSession(); setSession(null); }}>Çıkış</button>
      </p>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {items === null ? (
        <div className="loading">Yükleniyor…</div>
      ) : items.length === 0 ? (
        <div className="empty" style={{ paddingTop: 20 }}>
          <div className="big"><Icon name="mappin" size={44} /></div>
          <h2 className="serif">Henüz kayıtlı adresin yok</h2>
          <div>İlk adresini ekle — ödeme adımında hızlıca seçebilirsin.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((a) => (
            <div key={a.id} className="block" style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 24, display: 'flex', alignItems: 'center' }}><Icon name="mappin" size={24} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {a.label}
                  {a.isDefault && <span className="save" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} /> Varsayılan</span>}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{a.name} · {a.phone}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{a.district ? `${a.district} · ` : ''}{a.addressText}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="mappin" size={13} /> {a.lat.toFixed(5)}, {a.lng.toFixed(5)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {!a.isDefault && <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5 }} onClick={() => makeDefault(a)}>Varsayılan yap</button>}
                <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5 }} onClick={() => { setEditing(a); setFormOpen(true); }}>Düzenle</button>
                <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--berry)' }} onClick={() => remove(a)}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 18 }}><Link href="/siparislerim" className="back">Siparişlerim →</Link></p>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? 'Adresi düzenle' : 'Yeni adres'}>
        <AddressForm initial={editing} zones={zones} busy={busy} onSave={save} onCancel={() => { setFormOpen(false); setEditing(null); }} />
      </Modal>
    </>
  );
}
