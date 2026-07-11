import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { colors, fonts, radius } from '../src/theme';

/* ------------------------------- Etiket (Pill) ------------------------------- */

type TagKey = 'fresh' | 'local' | 'season';
const TAG_TEXT: Record<TagKey, string> = {
  fresh: 'GÜNLÜK TAZE',
  local: 'YÖRESEL',
  season: 'SEZON',
};
const TAG_STYLE: Record<TagKey, { bg: string; fg: string }> = {
  fresh: { bg: '#EAF3EA', fg: colors.forest },
  local: { bg: '#FBEEE6', fg: colors.persimmonDark },
  season: { bg: '#FBF2DD', fg: '#9A7415' },
};

export function Pill({ kind }: { kind: TagKey }) {
  const s = TAG_STYLE[kind];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{TAG_TEXT[kind]}</Text>
    </View>
  );
}

/** Ürünün etiketlerini isFreshDaily/isLocal'dan üret. */
export function productTags(p: { isFreshDaily?: boolean; isLocal?: boolean }): TagKey[] {
  const out: TagKey[] = [];
  if (p.isFreshDaily) out.push('fresh');
  if (p.isLocal) out.push('local');
  return out;
}

/* ------------------------------- Bölüm başlığı ------------------------------- */

export function SectionTitle({ title, actionLabel, onAction }: {
  title: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.sectit}>
      <Text style={styles.sectitH}>{title}</Text>
      {actionLabel ? (
        <Text style={styles.sectitA} onPress={onAction}>{actionLabel}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------- Toast ------------------------------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string) => {
    setMsg(m);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }, 1700);
  }, [opacity]);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
        <Text style={styles.toastText}>{msg}</Text>
      </Animated.View>
    </ToastCtx.Provider>
  );
}

/* ------------------------------- Stiller ------------------------------- */

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 10, fontFamily: fonts.bodyBold, letterSpacing: 0.2 },
  sectit: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8,
  },
  sectitH: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink },
  sectitA: { fontSize: 12, color: colors.persimmon, fontFamily: fonts.bodyBold },
  toast: {
    position: 'absolute', bottom: 28, alignSelf: 'center',
    backgroundColor: colors.forest, borderRadius: radius.md,
    paddingHorizontal: 18, paddingVertical: 12, maxWidth: '86%',
  },
  toastText: { color: colors.white, fontSize: 13, fontFamily: fonts.bodySemi, textAlign: 'center' },
});

export { styles as uiStyles };
export const componentStyleTypes: { view?: ViewStyle; text?: TextStyle } = {};
