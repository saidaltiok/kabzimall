'use client';

import { useEffect, type ReactNode } from 'react';

/** Panel geneli modal — overlay'e tıklama ve Esc ile kapanır. */
export default function Modal({
  open, onClose, title, sub, children, maxWidth = 620,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="admodal-ov" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="admodal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="admodal-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
          </div>
          <button className="admodal-x" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className="admodal-body">{children}</div>
      </div>
    </div>
  );
}
