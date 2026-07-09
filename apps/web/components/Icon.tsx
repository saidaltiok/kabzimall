import type { CSSProperties } from 'react';

/**
 * Kurumsal çizgi-ikon seti (tek kaynak). Lucide/Feather tarzı, 24×24 viewBox,
 * stroke = currentColor → renk metinden gelir, her boyutta keskin/vektörel.
 * Emoji yerine bunu kullan: <Icon name="cart" size={18} />.
 */
export type IconName =
  | 'sun' | 'basket' | 'cart' | 'target' | 'receipt' | 'wallet' | 'truck' | 'box' | 'folder'
  | 'chart' | 'users' | 'user' | 'coins' | 'settings' | 'leaf' | 'tag' | 'sliders' | 'grid'
  | 'star' | 'image' | 'headset' | 'mappin' | 'info' | 'check' | 'x' | 'edit' | 'refresh'
  | 'phone' | 'minus' | 'plus' | 'card' | 'undo' | 'bell' | 'pin' | 'message' | 'clock'
  | 'home' | 'search' | 'filter' | 'columns' | 'warning' | 'camera' | 'store' | 'calendar'
  | 'arrowUp' | 'arrowDown' | 'sort'
  | 'eye' | 'menu' | 'trash' | 'download' | 'send' | 'play' | 'building' | 'mail' | 'cash';

const P: Record<IconName, React.ReactNode> = {
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>),
  basket: (<><path d="M5 9h14l-1.3 9.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5 9z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /><path d="M10 13v3M14 13v3" /></>),
  cart: (<><circle cx="9.5" cy="20" r="1.4" /><circle cx="17.5" cy="20" r="1.4" /><path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L20 8H6" /></>),
  target: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></>),
  receipt: (<><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 12h6" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="17" cy="14.5" r="1.1" fill="currentColor" stroke="none" /></>),
  truck: (<><rect x="1.5" y="6" width="13" height="10" rx="1.5" /><path d="M14.5 9h3.5l3 3.2V16h-6.5z" /><circle cx="6" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>),
  box: (<><path d="M3 7.5l9-4.5 9 4.5v9L12 21 3 16.5z" /><path d="M3 7.5l9 4.5 9-4.5" /><path d="M12 12v9" /></>),
  folder: (<><path d="M3 7a2 2 0 0 1 2-2h4l2 2.2h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>),
  chart: (<><path d="M4 4v16h16" /><path d="M7.5 15l3.2-4 3 2.2 4.3-6" /></>),
  users: (<><circle cx="9" cy="8" r="3.3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.4a3 3 0 0 1 0 5.9" /><path d="M15.5 14.4A6 6 0 0 1 21 20" /></>),
  user: (<><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>),
  coins: (<><ellipse cx="9" cy="7" rx="5.5" ry="2.6" /><path d="M3.5 7v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7" /><ellipse cx="15" cy="15" rx="5.5" ry="2.6" /><path d="M9.5 15.3V17c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V15" /></>),
  settings: (<><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M22 12h-3M5 12H2M19 5l-2.1 2.1M7.1 16.9 5 19M19 19l-2.1-2.1M7.1 7.1 5 5" /></>),
  leaf: (<><path d="M4 20c0-9 6-15 16-16 0 10-7 16-16 16z" /><path d="M4 20c4-6 8-8.5 12-9.5" /></>),
  tag: (<><path d="M4 11.5V5a1 1 0 0 1 1-1h6.5a1 1 0 0 1 .7.3l7 7a1 1 0 0 1 0 1.4l-6.5 6.5a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1-.3-.7z" /><circle cx="8.5" cy="8.5" r="1.4" /></>),
  sliders: (<><path d="M4 8h9M17 8h3" /><circle cx="14.5" cy="8" r="2.2" /><path d="M4 16h3M11 16h9" /><circle cx="8.5" cy="16" r="2.2" /></>),
  grid: (<><rect x="4" y="4" width="7" height="7" rx="1.4" /><rect x="13" y="4" width="7" height="7" rx="1.4" /><rect x="4" y="13" width="7" height="7" rx="1.4" /><rect x="13" y="13" width="7" height="7" rx="1.4" /></>),
  star: (<><path d="M12 3l2.7 5.6 6 .8-4.4 4.2 1.1 6L12 17.8 6.6 19.6l1.1-6L3.3 9.4l6-.8z" /></>),
  image: (<><rect x="3" y="4.5" width="18" height="15" rx="2" /><circle cx="8.5" cy="9.5" r="1.9" /><path d="M4 17l5-4.5 4 3.5 3.5-3 3.5 3.5" /></>),
  headset: (<><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="2.5" y="13" width="4" height="6.5" rx="1.6" /><rect x="17.5" y="13" width="4" height="6.5" rx="1.6" /><path d="M20 19.5a4 4 0 0 1-4 3.5h-3" /></>),
  mappin: (<><path d="M12 21s-6.5-6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.4" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r="0.7" fill="currentColor" stroke="none" /></>),
  check: (<><path d="M4.5 12.5l5 5 10-11" /></>),
  x: (<><path d="M6 6l12 12M18 6L6 18" /></>),
  edit: (<><path d="M4 20l1.2-4.2L16 5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8.2 18.8z" /><path d="M14.5 6.5l3 3" /></>),
  refresh: (<><path d="M4.5 11a7.5 7.5 0 0 1 13-4l2 2" /><path d="M19.5 4v5.5H14" /><path d="M19.5 13a7.5 7.5 0 0 1-13 4l-2-2" /><path d="M4.5 20v-5.5H10" /></>),
  phone: (<><path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 5.1 5.1l1.4-2.3L19 16.5V20a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.6 1.5 1.5 0 0 1 5 5z" /></>),
  minus: (<><path d="M5 12h14" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  card: (<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /></>),
  undo: (<><path d="M9 7L4 11.5 9 16" /><path d="M4 11.5h10a5.5 5.5 0 0 1 0 11h-3" /></>),
  bell: (<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 2H4.2z" /><path d="M9.8 20a2.2 2.2 0 0 0 4.4 0" /></>),
  pin: (<><path d="M9 3h6l-1 5 3 2.5V13h-4v6l-1 2-1-2v-6H6v-2.5L9 8z" /></>),
  message: (<><path d="M4 5.5h16v10H8.5L4 20z" /><path d="M8 9h8M8 12h5" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>),
  home: (<><path d="M4 11l8-6.5 8 6.5" /><path d="M6 9.7V19.5h12V9.7" /></>),
  search: (<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.3-4.3" /></>),
  filter: (<><path d="M4 5h16l-6.2 7.3V19l-3.6 1.6v-8.3z" /></>),
  columns: (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 4v16" /></>),
  warning: (<><path d="M12 4.5l8.5 15H3.5z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" /></>),
  camera: (<><rect x="3" y="7.5" width="18" height="12.5" rx="2.4" /><circle cx="12" cy="13.7" r="3.5" /><path d="M8.5 7.5l1.6-3h3.8l1.6 3" /></>),
  store: (<><path d="M4 9.5 5.2 5h13.6L20 9.5" /><path d="M5.2 9.5V19.5h13.6V9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M9.5 19.5v-5h5v5" /></>),
  calendar: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" /></>),
  arrowUp: (<><path d="M12 19V5M6 11l6-6 6 6" /></>),
  arrowDown: (<><path d="M12 5v14M6 13l6 6 6-6" /></>),
  sort: (<><path d="M8 4v15M5 8l3-4 3 4" /><path d="M16 20V5M13 16l3 4 3-4" /></>),
  eye: (<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  menu: (<><path d="M4 7h16M4 12h16M4 17h16" /></>),
  trash: (<><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 13h9l1-13" /><path d="M10 11v6M14 11v6" /></>),
  download: (<><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></>),
  send: (<><path d="M21 3L10.5 13.5" /><path d="M21 3l-6.8 18-3.7-8.2L2.3 9z" /></>),
  play: (<><path d="M7 5l12 7-12 7z" /></>),
  building: (<><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>),
  cash: (<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M5 9v6M19 9v6" /></>),
};

export default function Icon({ name, size = 18, style, strokeWidth = 1.8, className }: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ display: 'inline-block', flex: 'none', verticalAlign: '-0.15em', ...style }}
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
