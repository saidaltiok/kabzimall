'use client';

import { useEffect, type ReactNode } from 'react';

/** Basit erişilebilir modal — overlay'e tıklama ve Esc ile kapanır. */
export default function Modal({
  open, onClose, title, children, footer, maxWidth = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="serif">{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
      <style jsx global>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(20, 30, 24, 0.55); backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center; padding: 18px; z-index: 1000; animation: mo-fade .15s ease; }
        .modal-card { background: var(--cream, #f6f1e7); border-radius: 18px; width: 100%; max-width: ${maxWidth}px;
          box-shadow: 0 40px 90px -30px rgba(0,0,0,.5); overflow: hidden; animation: mo-pop .18s ease; }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 6px; }
        .modal-head h3 { margin: 0; font-size: 19px; }
        .modal-x { border: none; background: none; font-size: 16px; cursor: pointer; color: var(--muted, #7c7667); padding: 4px 6px; }
        .modal-body { padding: 6px 20px 8px; font-size: 14px; line-height: 1.6; }
        .modal-foot { display: flex; gap: 10px; justify-content: flex-end; padding: 12px 20px 18px; }
        @keyframes mo-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mo-pop { from { transform: translateY(8px) scale(.98); opacity: .6 } to { transform: none; opacity: 1 } }
      `}</style>
    </div>
  );
}
