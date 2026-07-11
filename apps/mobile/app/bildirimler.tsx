import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius, shadow } from '../src/theme';

const PREFS_KEY = 'km_notif_prefs';
const ITEMS: { key: string; title: string; desc: string; def: boolean }[] = [
  { key: 'orders', title: 'Sipariş güncellemeleri', desc: 'Hazırlanıyor, yola çıktı, teslim edildi bildirimleri', def: true },
  { key: 'promos', title: 'Kampanya & fırsatlar', desc: 'İndirim ve mevsim ürünleri duyuruları', def: true },
  { key: 'email', title: 'E-posta ile bildirim', desc: 'Sipariş özeti ve önemli güncellemeler e-postana', def: true },
];

export default function NotificationSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ITEMS.map((i) => [i.key, i.def])),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => { if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) })); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const toggle = (key: string) => {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Bildirim ayarları</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {ITEMS.map((item, i) => (
            <View key={item.key} style={[styles.row, i > 0 && styles.divider]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.desc}>{item.desc}</Text>
              </View>
              <Switch
                value={ready ? prefs[item.key] : item.def}
                onValueChange={() => toggle(item.key)}
                trackColor={{ true: colors.forest, false: colors.line }}
                thumbColor={colors.white}
              />
            </View>
          ))}
        </View>
        <Text style={styles.note}>
          Tercihlerin bu cihazda saklanır. Anlık (push) bildirim altyapısı yakında; şimdilik sipariş
          güncellemelerini uygulamadan ve e-posta ile alırsın.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  card: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 14, ...shadow.soft },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  title: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  desc: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  note: { color: colors.muted, fontSize: 11.5, textAlign: 'center', marginTop: 16, paddingHorizontal: 24, lineHeight: 17 },
});
