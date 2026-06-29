'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import Topbar from '@/components/Topbar';

interface Zone { id: string; name: string; isActive: boolean }

export default function BolgelerPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<{ data: Zone[] }>('/admin/delivery-zones');
      setZones(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setError(null);
    try {
      await apiSend('POST', '/admin/delivery-zones', { name });
      setName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    try { await apiSend('DELETE', `/admin/delivery-zones/${id}`); await load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Topbar title="Teslimat Bölgeleri" sub="Hizmet verilen ilçeler" />
      <div className="body">
        <p className="hint">
          Hizmet verdiğin ilçeleri ekle. <b>Liste boşsa</b> tüm adreslere sipariş alınır; ilçe
          eklediğinde müşteri checkout'ta ilçe seçer ve yalnızca bu ilçelere sipariş verilebilir.
        </p>
        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">İlçe ekle</div>
          <div className="form-row">
            <div className="field">
              <label>İlçe adı</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kadıköy" onKeyDown={(e) => e.key === 'Enter' && name && add()} />
            </div>
            <button className="btn" onClick={add} disabled={!name}>Ekle</button>
          </div>
        </div>

        <div className="card">
          <div className="ct">Hizmet bölgeleri <span>{zones.length}</span></div>
          {zones.length === 0 ? (
            <p className="muted">Henüz ilçe yok — şu an tüm adreslere sipariş alınıyor.</p>
          ) : (
            <div className="pchips">
              {zones.map((z) => (
                <div className="pchip" key={z.id}>
                  📍 {z.name}
                  <span style={{ cursor: 'pointer', color: 'var(--berry)', marginLeft: 4 }} onClick={() => remove(z.id)}>✕</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
