import type { ReactNode } from 'react';

/** Yasal metin sayfaları için ortak iskelet (tutarlı tipografi + güncelleme tarihi). */
export default function Legal({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '30px 0' }}>
      <h1 className="h1">{title}</h1>
      <p className="muted" style={{ marginTop: -6, fontSize: 12.5 }}>Son güncelleme: {updated}</p>
      <div className="legal" style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink, #26241f)' }}>
        {children}
      </div>
      <style>{`
        .legal h2 { font-family: 'Fraunces', serif; font-size: 17px; margin: 26px 0 8px; }
        .legal p, .legal li { margin: 8px 0; }
        .legal ul { padding-left: 22px; }
        .legal .doldur { background: #fff7ed; border: 1px dashed var(--honey, #E6B450); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
      `}</style>
    </div>
  );
}
