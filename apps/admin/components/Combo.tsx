'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComboOption {
  value: string;
  label: string;
  hint?: string; // ör. kategori adı / birim
  icon?: string;
}

/**
 * Aranabilir tek-seçim açılır liste (slug elle yazma yerine). Yazarak filtreler,
 * tıklayarak seçer, dışarı tıklayınca kapanır. value = seçilen option.value.
 */
export default function Combo({
  options, value, onChange, placeholder = 'Seç…', disabled, allowClear, style,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr');
    if (!term) return options.slice(0, 60);
    return options.filter((o) => o.label.toLocaleLowerCase('tr').includes(term) || (o.hint ?? '').toLocaleLowerCase('tr').includes(term)).slice(0, 60);
  }, [options, q]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <button
        type="button" disabled={disabled}
        onClick={() => { if (!disabled) { setOpen((o) => !o); setQ(''); } }}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--line)', borderRadius: 10, background: disabled ? '#f6f5f2' : '#fff',
          padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', color: selected ? 'inherit' : 'var(--muted)',
        }}
      >
        {selected ? <>{selected.icon ? selected.icon + ' ' : ''}{selected.label}{selected.hint ? <span className="muted" style={{ fontSize: 11 }}> · {selected.hint}</span> : ''}</> : placeholder}
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(0,0,0,.35)', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…"
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {allowClear && (
              <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>— Seçimi kaldır</div>
            )}
            {filtered.length === 0 ? (
              <div className="muted" style={{ padding: '10px 12px', fontSize: 13 }}>Eşleşen yok.</div>
            ) : filtered.map((o) => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ padding: '8px 12px', fontSize: 13.5, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', background: o.value === value ? 'var(--cream, #f6f3ec)' : '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream, #f6f3ec)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = o.value === value ? 'var(--cream, #f6f3ec)' : '#fff')}
              >
                {o.icon && <span>{o.icon}</span>}
                <span>{o.label}</span>
                {o.hint && <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{o.hint}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
