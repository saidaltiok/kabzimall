'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface Competitor { id: string; name: string; group: { id: string; name: string } }
interface Group { id: string; name: string }
interface Prices {
  productId: string;
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  entries: { competitorId: string; competitor: string; group: string; price: number }[];
}

const CHIPS = [
  { id: 'domates', e: '🍅', name: 'Domates' },
  { id: 'patates', e: '🥔', name: 'Patates' },
  { id: 'biber', e: '🫑', name: 'Biber' },
  { id: 'salatalik', e: '🥒', name: 'Salatalık' },
];

export default function RakipPage() {
  const [productId, setProductId] = useState('domates');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // yeni rakip
  const [newComp, setNewComp] = useState('');
  const [newGroup, setNewGroup] = useState('');

  const loadMeta = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([
        apiGet<{ data: Competitor[] }>('/intel/competitors'),
        apiGet<{ data: Group[] }>('/intel/competitor-groups'),
      ]);
      setCompetitors(c.data);
      setGroups(g.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadPrices = useCallback(async (pid: string) => {
    try {
      setPrices(await apiGet<Prices>(`/intel/competitor-prices?productId=${encodeURIComponent(pid)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (productId) loadPrices(productId); }, [productId, loadPrices]);

  function currentPrice(competitorId: string): number | null {
    return prices?.entries.find((e) => e.competitorId === competitorId)?.price ?? null;
  }

  async function savePrice(competitorId: string) {
    const raw = inputs[competitorId];
    if (!raw) return;
    setBusy(true);
    setError(null);
    try {
      const kurus = Math.round(parseFloat(raw.replace(',', '.')) * 100);
      if (!Number.isFinite(kurus) || kurus < 0) throw new Error('Geçerli fiyat girin (₺).');
      await apiSend('POST', '/intel/competitor-prices/entries', { productId, competitorId, price: kurus });
      setInputs((s) => ({ ...s, [competitorId]: '' }));
      await loadPrices(productId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addCompetitor() {
    if (!newComp || !newGroup) return;
    setBusy(true);
    setError(null);
    try {
      let group = groups.find((g) => g.name.toLowerCase() === newGroup.trim().toLowerCase());
      if (!group) group = await apiSend<Group>('POST', '/intel/competitor-groups', { name: newGroup.trim() });
      await apiSend('POST', '/intel/competitors', { name: newComp.trim(), groupId: group.id });
      setNewComp('');
      setNewGroup('');
      await loadMeta();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Rakip Fiyatları" sub="Rakip ve grup karşılaştırması" />
      <div className="body">
        <div className="pchips">
          {CHIPS.map((c) => (
            <div key={c.id} className={`pchip${productId === c.id ? ' sel' : ''}`} onClick={() => setProductId(c.id)}>
              <span className="e">{c.e}</span>
              {c.name}
            </div>
          ))}
        </div>
        <p className="hint">
          Seçili ürün için rakip fiyatlarını gir; <b>min · maks · ortalama · medyan</b> anında güncellenir
          (rakip başına en güncel fiyat). Fiyatlar append-only kaydedilir.
        </p>

        {error && <div className="error">{error}</div>}

        <div className="card">
          <div className="ct">
            {productId} — rakip fiyatları <span>{prices?.count ?? 0} rakip fiyatlı</span>
          </div>
          {competitors.length === 0 ? (
            <p className="muted">Henüz rakip yok. Aşağıdan ekleyebilirsin.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rakip</th>
                  <th>Grup</th>
                  <th className="num">Güncel</th>
                  <th className="num">Yeni fiyat (₺)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className="tagp info">{c.group.name}</span></td>
                    <td className="num">{tl(currentPrice(c.id))}</td>
                    <td className="num">
                      <input
                        className="cell"
                        style={{ width: 90 }}
                        value={inputs[c.id] ?? ''}
                        onChange={(e) => setInputs((s) => ({ ...s, [c.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && savePrice(c.id)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <button className="btn ghost" onClick={() => savePrice(c.id)} disabled={busy || !inputs[c.id]}>
                        Kaydet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {prices && prices.count > 0 && (
            <div className="miniinfo" style={{ marginTop: 12 }}>
              <span>Min <b>{tl(prices.min)}</b></span>
              <span>Maks <b>{tl(prices.max)}</b></span>
              <span>Ortalama <b>{tl(prices.average)}</b></span>
              <span>Medyan <b>{tl(prices.median)}</b></span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="ct">Yeni rakip ekle</div>
          <div className="form-row">
            <div className="field">
              <label>Rakip adı</label>
              <input value={newComp} onChange={(e) => setNewComp(e.target.value)} placeholder="Migros" />
            </div>
            <div className="field">
              <label>Grup (varsa seç / yeni yaz)</label>
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Orta"
                list="groups"
              />
              <datalist id="groups">
                {groups.map((g) => (
                  <option key={g.id} value={g.name} />
                ))}
              </datalist>
            </div>
            <button className="btn" onClick={addCompetitor} disabled={busy || !newComp || !newGroup}>
              Rakip ekle
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
