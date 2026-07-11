/**
 * KabzıMall mobil — tasarım tokenları.
 * Değerler KabziMall_Prototip.html :root değişkenlerinden birebir alındı.
 */
export const colors = {
  forest: '#1F4D38',
  forestDark: '#163A2A',
  moss: '#5C8A5A',
  cream: '#F6F1E7',
  creamDark: '#EFE7D6',
  card: '#FFFFFF',
  persimmon: '#E8703A',
  persimmonDark: '#CF5D2B',
  berry: '#9E2B3A',
  honey: '#E6B450',
  ink: '#1E241C',
  muted: '#7C857A',
  line: '#E7E0D2',
  white: '#FFFFFF',
};

/** Fraunces (başlıklar) + Inter (gövde). Yüklenene kadar sistem yazı tipi. */
export const fonts = {
  serif: 'Fraunces_600SemiBold',
  serifReg: 'Fraunces_500Medium',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

export const radius = {
  sm: 11,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 30,
};

/** Yumuşak, orman-yeşili tonlu gölge (prototipteki --shadow-sm). */
export const shadow = {
  card: {
    shadowColor: '#1F4D38',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  soft: {
    shadowColor: '#1F4D38',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
};

/** Kategori simgeleri (prototip CATS). */
export const CATEGORY_ICONS: Record<string, string> = {
  meyve: '🍑',
  sebze: '🥬',
  yag: '🫒',
  zeytinyagi: '🫒',
  kahvalti: '🧀',
  yoresel: '🏺',
};
