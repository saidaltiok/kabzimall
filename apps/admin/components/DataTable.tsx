'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Hücre içeriği. */
  render: (row: T) => React.ReactNode;
  /** Sıralanabilir mi + sıralama değeri (yoksa sıralanmaz). */
  sortValue?: (row: T) => string | number | null;
  /** Başlangıçta gizli mi. */
  defaultHidden?: boolean;
  /** Bu sütun gizlenemez/taşınamaz (ör. ana ürün adı). */
  locked?: boolean;
}

interface Prefs { order: string[]; hidden: string[]; pinned: string[]; sortKey: string | null; sortDir: 'asc' | 'desc' }

function loadPrefs(id: string): Partial<Prefs> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(`dt:${id}`) || '{}'); } catch { return {}; }
}

/**
 * Etkileşimli tablo: başlığa tıkla → sırala (artan/azalan/kapalı); ⚙ menüsünden
 * sütun gizle/göster, pinle (sola sabitle), yukarı/aşağı ile yeniden sırala.
 * Tercihler tarayıcıda (localStorage) `id` başına saklanır.
 */
export default function DataTable<T>({ id, columns, rows, rowKey, onRowClick, emptyText = 'Kayıt yok.' }: {
  id: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
}) {
  const colMap = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const defaultOrder = columns.map((c) => c.key);
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [hidden, setHidden] = useState<string[]>(columns.filter((c) => c.defaultHidden).map((c) => c.key));
  const [pinned, setPinned] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // localStorage'dan tercihleri yükle (yalnız bir kez, kolonlar değişse de anahtar sabit).
  useEffect(() => {
    const p = loadPrefs(id);
    // Kayıtlı sıraya, sonradan eklenen yeni kolonları da iliştir.
    const known = new Set(defaultOrder);
    const savedOrder = (p.order ?? []).filter((k) => known.has(k));
    const merged = [...savedOrder, ...defaultOrder.filter((k) => !savedOrder.includes(k))];
    setOrder(merged);
    if (p.hidden) setHidden(p.hidden.filter((k) => known.has(k)));
    if (p.pinned) setPinned(p.pinned.filter((k) => known.has(k)));
    if (p.sortKey !== undefined) setSortKey(p.sortKey);
    if (p.sortDir) setSortDir(p.sortDir);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(`dt:${id}`, JSON.stringify({ order, hidden, pinned, sortKey, sortDir }));
  }, [id, order, hidden, pinned, sortKey, sortDir]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Görünür kolonlar: pinliler önce (order sırasında), sonra kalanlar.
  const visible = order.filter((k) => !hidden.includes(k) && colMap.has(k));
  const ordered = [...visible].sort((a, b) => (pinned.includes(b) ? 1 : 0) - (pinned.includes(a) ? 1 : 0));

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = colMap.get(sortKey);
    if (!col?.sortValue) return rows;
    const val = col.sortValue;
    return [...rows].sort((r1, r2) => {
      const a = val(r1); const b = val(r2);
      if (a == null && b == null) return 0;
      if (a == null) return 1; if (b == null) return -1;
      const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'tr');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, colMap]);

  function clickSort(key: string) {
    const col = colMap.get(key);
    if (!col?.sortValue) return;
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); } // 3. tık: sıralamayı kapat
  }
  const move = (key: string, dir: -1 | 1) => setOrder((o) => {
    const i = o.indexOf(key); const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const toggleHidden = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  const togglePin = (key: string) => setPinned((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const reset = () => { setOrder(defaultOrder); setHidden(columns.filter((c) => c.defaultHidden).map((c) => c.key)); setPinned([]); setSortKey(null); setSortDir('asc'); };

  // Pinli sütunların sol ofsetleri (sticky).
  const pinnedVisible = ordered.filter((k) => pinned.includes(k));
  const leftOffset = (key: string) => {
    const idx = pinnedVisible.indexOf(key);
    if (idx <= 0) return 0;
    return pinnedVisible.slice(0, idx).length * 140; // yaklaşık sütun genişliği
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={menuRef} style={{ position: 'absolute', right: 0, top: -34, zIndex: 20 }}>
        <button className="btn ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setMenuOpen((o) => !o)} title="Sütunları düzenle">⚙ Sütunlar</button>
        {menuOpen && (
          <div style={{ position: 'absolute', right: 0, top: 32, width: 280, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(0,0,0,.35)', padding: 8, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px 8px' }}>
              <b style={{ fontSize: 12.5 }}>Sütunlar</b>
              <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5 }} onClick={reset}>Sıfırla</button>
            </div>
            {order.filter((k) => colMap.has(k)).map((k) => {
              const c = colMap.get(k)!;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 12.5 }}>
                  <input type="checkbox" checked={!hidden.includes(k)} disabled={c.locked} onChange={() => toggleHidden(k)} />
                  <span style={{ flex: 1, opacity: hidden.includes(k) ? 0.5 : 1 }}>{c.label}</span>
                  {!c.locked && <button title={pinned.includes(k) ? 'Sabitlemeyi kaldır' : 'Sola sabitle'} onClick={() => togglePin(k)} style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: pinned.includes(k) ? 1 : 0.35 }}>📌</button>}
                  <button title="Yukarı" onClick={() => move(k, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>↑</button>
                  <button title="Aşağı" onClick={() => move(k, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>↓</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {ordered.map((k) => {
                const c = colMap.get(k)!;
                const isPinned = pinned.includes(k);
                const sortable = !!c.sortValue;
                return (
                  <th
                    key={k}
                    className={c.align === 'right' ? 'num' : undefined}
                    onClick={() => clickSort(k)}
                    style={{ cursor: sortable ? 'pointer' : 'default', whiteSpace: 'nowrap', ...(isPinned ? { position: 'sticky', left: leftOffset(k), background: 'var(--cream, #f6f3ec)', zIndex: 2 } : {}) }}
                    title={sortable ? 'Sırala' : undefined}
                  >
                    {c.label}{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : sortable ? ' ⇅' : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr><td colSpan={ordered.length} className="muted" style={{ padding: 14 }}>{emptyText}</td></tr>
            ) : sortedRows.map((row) => (
              <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {ordered.map((k) => {
                  const c = colMap.get(k)!;
                  const isPinned = pinned.includes(k);
                  return (
                    <td key={k} className={c.align === 'right' ? 'num' : undefined} style={isPinned ? { position: 'sticky', left: leftOffset(k), background: '#fff', zIndex: 1 } : undefined}>
                      {c.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
