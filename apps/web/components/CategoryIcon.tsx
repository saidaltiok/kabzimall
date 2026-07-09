/**
 * Kategori illüstrasyonları — rakiplerdeki (Getir/Migros) gibi renkli, flat,
 * sıcak vektör simgeler. Emoji yerine kullanılır; her boyutta keskin. Tek dosya,
 * harici görsel yok. slug'a göre çizim; bilinmeyende sepet.
 */
export type CategorySlug = 'meyve' | 'sebze' | 'yoresel' | 'all' | 'favs' | string;

function Svg({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ display: 'block' }} aria-hidden="true">
      {children}
    </svg>
  );
}

export default function CategoryIcon({ slug, size = 34 }: { slug: CategorySlug; size?: number }) {
  switch (slug) {
    case 'meyve': // elma + yaprak
      return (
        <Svg size={size}>
          <circle cx="19" cy="28" r="10.5" fill="#e4572e" />
          <circle cx="29" cy="28" r="10.5" fill="#ef6a3d" />
          <rect x="22.8" y="11" width="2.4" height="8" rx="1.2" fill="#7a5230" />
          <path d="M25 18c0-4 3-7.5 8-7.5 0 4.5-3.5 7.5-8 7.5z" fill="#4a9b52" />
          <path d="M25 18c0-4 3-7.5 8-7.5" stroke="#3c8144" strokeWidth="1" />
          <ellipse cx="15" cy="24" rx="2.4" ry="4" fill="#fff" opacity="0.3" />
        </Svg>
      );
    case 'sebze': // havuç + yeşillik
      return (
        <Svg size={size}>
          <path d="M24 43 L17.6 21.5a1.4 1.4 0 0 1 1.35-1.8h10.1a1.4 1.4 0 0 1 1.35 1.8z" fill="#ee7b3d" />
          <path d="M20.5 26h7M21.5 31h5M22.5 36h3" stroke="#cf6427" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 20c-1.5-4-4-6-7.5-6.5 1 4 3.5 6 7.5 6.5z" fill="#4a9b52" />
          <path d="M24 20c-0.5-4.5 0-7 1-8.5 2.5 3.5 2 6.5 -1 8.5z" fill="#57a95f" />
          <path d="M24 20c1.5-4 4-6 7.5-6.5-1 4-3.5 6-7.5 6.5z" fill="#4a9b52" />
        </Svg>
      );
    case 'yoresel': // zeytinyağı şişesi
      return (
        <Svg size={size}>
          <rect x="18.5" y="18.5" width="11" height="21.5" rx="3.2" fill="#6f9a55" />
          <rect x="21" y="10.5" width="6" height="8.5" fill="#6f9a55" />
          <rect x="20" y="7.5" width="8" height="4.2" rx="1.5" fill="#3f5e33" />
          <rect x="18.5" y="26.5" width="11" height="9" rx="1.2" fill="#f5edd8" />
          <path d="M21.5 30.5h5M21.5 33h3.5" stroke="#c9a24a" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="21.6" cy="23" rx="1.4" ry="3.4" fill="#fff" opacity="0.28" />
        </Svg>
      );
    case 'all': // alışveriş poşeti
      return (
        <Svg size={size}>
          <path d="M13 19h22a1 1 0 0 1 1 1.1l-1.7 18.8a2.5 2.5 0 0 1-2.5 2.3H16.2a2.5 2.5 0 0 1-2.5-2.3L12 20.1A1 1 0 0 1 13 19z" fill="#f0a03c" />
          <path d="M18 19v-2.6a6 6 0 0 1 12 0V19" stroke="#cf7a26" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M18 25l.6 9M30 25l-.6 9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
        </Svg>
      );
    case 'favs': // kalp
      return (
        <Svg size={size}>
          <path d="M24 39C10.5 30.5 8 20.5 15 16.2c4-2.4 8 .2 9 3 1-2.8 5-5.4 9-3 7 4.3 4.5 14.3-9 22.8z" fill="#e4572e" />
        </Svg>
      );
    default: // hasır sepet
      return (
        <Svg size={size}>
          <path d="M17 20l3-7M31 20l-3-7" stroke="#a5713c" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 20.5h26l-2.5 16.8a2 2 0 0 1-2 1.7H15.5a2 2 0 0 1-2-1.7z" fill="#cf9358" />
          <path d="M11 20.5h26" stroke="#8f6234" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M18 22v15M24 22v15M30 22v15" stroke="#b07c44" strokeWidth="1.5" opacity="0.7" />
        </Svg>
      );
  }
}
