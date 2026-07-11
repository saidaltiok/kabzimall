import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../src/theme';
import { useCart } from '../../src/cart';

const TAB_DEFS = [
  { name: 'index', href: '/', label: 'Ana Sayfa', icon: '🏠' },
  { name: 'kategori', href: '/kategori', label: 'Kategori', icon: '🗂️' },
  { name: 'sepet', href: '/sepet', label: 'Sepet', icon: '🛒' },
  { name: 'siparisler', href: '/siparisler', label: 'Siparişler', icon: '📦' },
  { name: 'hesap', href: '/hesap', label: 'Hesap', icon: '👤' },
] as const;

type TabButtonProps = TabTriggerSlotProps & { icon: string; label: string; badge?: number };

/** Prototip alt sekmesi: aktifte turuncu, pasifte soluk emoji; sepette rozet. */
const TabButton = forwardRef<View, TabButtonProps>(
  ({ icon, label, badge, isFocused, ...props }, ref) => (
    <Pressable ref={ref} {...props} style={styles.tab}>
      <View>
        <Text style={[styles.icon, !isFocused && styles.iconInactive]}>{icon}</Text>
        {badge ? (
          <View style={styles.dot}><Text style={styles.dotTxt}>{badge}</Text></View>
        ) : null}
      </View>
      <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
    </Pressable>
  ),
);
TabButton.displayName = 'TabButton';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const cart = useCart();

  return (
    <Tabs style={styles.root}>
      <TabSlot />
      <TabList style={StyleSheet.flatten([styles.nav, { paddingBottom: Math.max(insets.bottom, 12) }])}>
        {TAB_DEFS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton
              icon={t.icon}
              label={t.label}
              badge={t.name === 'sepet' && cart.count > 0 ? cart.count : undefined}
            />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  nav: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  icon: { fontSize: 20 },
  iconInactive: { opacity: 0.45 },
  label: { fontSize: 9.5, color: colors.muted, fontFamily: fonts.bodySemi },
  labelActive: { color: colors.persimmon },
  dot: {
    position: 'absolute', top: -4, right: -12, backgroundColor: colors.persimmon,
    minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dotTxt: { color: colors.white, fontSize: 9, fontFamily: fonts.bodyBold },
});
