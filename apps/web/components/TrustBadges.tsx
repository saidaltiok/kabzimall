/** Güven rozetleri — iade sayfasındaki sözleri satın alma anında görünür kılar. */
export default function TrustBadges({ compact = false }: { compact?: boolean }) {
  const items = [
    ['🚪', 'Kapıda kontrol et', 'Beğenmediğini teslim alma, bedeli tahsil edilmez'],
    ['⚖️', 'Tartı şeffaflığı', 'Kesin tutar gerçek gramajla; farkı sipariş sayfanda gör'],
    ['🌿', 'Halden taze', 'Sabah halden alınır, aynı gün paketlenir'],
  ] as const;
  return (
    <div style={{ display: 'flex', gap: compact ? 10 : 14, flexWrap: 'wrap', margin: compact ? '10px 0 0' : '14px 0' }}>
      {items.map(([icon, title, desc]) => (
        <div key={title} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: '1 1 150px', minWidth: 150 }}>
          <span style={{ fontSize: compact ? 16 : 20 }}>{icon}</span>
          <span>
            <b style={{ fontSize: compact ? 12 : 13, display: 'block' }}>{title}</b>
            {!compact && <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{desc}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
