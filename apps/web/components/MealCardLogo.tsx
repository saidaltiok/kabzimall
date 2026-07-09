/**
 * Yemek kartı kurumsal logoları — kendi çizdiğimiz, marka renk/biçimine sadık
 * inline SVG wordmark'lar (harici görsel/CDN yok, keskin/vektörel). Nakit/kart için
 * basit çizgi ikon. `h` yükseklik (px); genişlik orantılı.
 */
export type PayId = 'COD' | 'CASH' | 'CARD' | 'SETCARD' | 'MULTINET' | 'TOKENFLEX' | 'EDENRED' | 'METROPOL';

function Wordmark({ text, bg, fg = '#fff', h }: { text: string; bg: string; fg?: string; h: number }) {
  const w = Math.round(text.length * h * 0.62 + h * 0.9);
  return (
    <svg height={h} width={w} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={text} style={{ display: 'block' }}>
      <rect x="0" y="0" width={w} height={h} rx={h * 0.26} fill={bg} />
      <text x={w / 2} y={h * 0.5} dominantBaseline="central" textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize={h * 0.5}
        letterSpacing={-0.3} fill={fg}>{text}</text>
    </svg>
  );
}

export function MealCardLogo({ id, h = 18 }: { id: PayId; h?: number }) {
  switch (id) {
    case 'MULTINET': return <Wordmark text="multinet" bg="#f47216" fg="#0b1f3a" h={h} />;
    case 'SETCARD': return <Wordmark text="setcard" bg="#0a5bb5" h={h} />;
    case 'EDENRED': return <Wordmark text="edenred" bg="#12285a" h={h} />;
    case 'METROPOL': return <Wordmark text="metropol" bg="#e0121b" h={h} />;
    case 'TOKENFLEX': return <Wordmark text="token flex" bg="#5b2a86" h={h} />;
    case 'CARD':
      return (
        <svg height={h} width={h * 1.4} viewBox="0 0 28 20" aria-label="Kart" style={{ display: 'block' }}>
          <rect x="1" y="2" width="26" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <rect x="1" y="5.5" width="26" height="3.2" fill="currentColor" />
        </svg>
      );
    case 'COD':
    case 'CASH':
    default:
      return (
        <svg height={h} width={h * 1.4} viewBox="0 0 28 20" aria-label="Nakit" style={{ display: 'block' }}>
          <rect x="1" y="3" width="26" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="14" cy="10" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
  }
}
