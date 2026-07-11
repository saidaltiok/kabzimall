import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../../src/theme';
import { tl, orderTotal, orderSlotLabel } from '../../src/format';
import { myOrders, lookupOrder } from '../../src/api';
import { useSession } from '../../src/session';
import type { Order, OrderStatus } from '../../src/types';

const STATUS_LABEL: Record<OrderStatus, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazırlandı',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');

  const loadMine = useCallback(() => {
    if (!session.token) { setOrders([]); return; }
    setLoading(true);
    myOrders(session.token)
      .then((r) => setOrders(r.data ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [session.token]);

  useFocusEffect(useCallback(() => { loadMine(); }, [loadMine]));

  const doLookup = async () => {
    if (!code.trim() || !phone.trim()) return Alert.alert('Sorgu', 'Sipariş no ve telefon gerekli.');
    try {
      const o = await lookupOrder(code.trim(), phone.trim());
      router.push(`/siparis/${o.id}`);
    } catch (e: any) {
      Alert.alert('Bulunamadı', e?.message ?? 'Sipariş bulunamadı.');
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Siparişlerim</Text>

      {session.token ? (
        loading ? (
          <ActivityIndicator color={colors.forest} style={{ marginTop: 30 }} />
        ) : orders.length === 0 ? (
          <Empty onShop={() => router.push('/')} />
        ) : (
          orders.map((o) => (
            <Pressable key={o.id} style={styles.card} onPress={() => router.push(`/siparis/${o.id}`)}>
              <View style={styles.ph}><Text style={{ fontSize: 24 }}>🧾</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{o.code}</Text>
                <Text style={styles.meta}>{o.items?.length ?? 0} kalem · {orderSlotLabel(o)}</Text>
                <Text style={styles.total}>{tl(orderTotal(o))}</Text>
              </View>
              <View style={styles.badge}><Text style={styles.badgeTxt}>{STATUS_LABEL[o.status] ?? o.status}</Text></View>
            </Pressable>
          ))
        )
      ) : (
        <>
          <View style={styles.signCard}>
            <Text style={styles.signH}>Cihazdan bağımsız siparişlerin</Text>
            <Text style={styles.signS}>E-posta ile giriş yap; tüm siparişlerin burada görünsün.</Text>
            <Pressable style={styles.signBtn} onPress={() => router.push('/giris')}>
              <Text style={styles.signBtnTxt}>E-posta ile giriş yap</Text>
            </Pressable>
          </View>

          <Text style={styles.orLabel}>veya sipariş sorgula</Text>
          <View style={styles.lookup}>
            <TextInput style={styles.input} placeholder="Sipariş no (KM…)" placeholderTextColor={colors.muted} autoCapitalize="characters" value={code} onChangeText={setCode} />
            <TextInput style={styles.input} placeholder="Telefon (05XX…)" placeholderTextColor={colors.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <Pressable style={styles.lookupBtn} onPress={doLookup}><Text style={styles.lookupBtnTxt}>Sorgula</Text></Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Empty({ onShop }: { onShop: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 56 }}>📦</Text>
      <Text style={styles.emptyH}>Henüz siparişin yok</Text>
      <Text style={styles.emptyS}>İlk siparişini ver, burada görünsün.</Text>
      <Pressable style={styles.shopBtn} onPress={onShop}><Text style={styles.shopBtnTxt}>Alışverişe başla</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  title: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink, paddingHorizontal: 18, paddingBottom: 4 },
  card: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.lg, padding: 11,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft,
  },
  ph: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.creamDark, alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 13.5, fontFamily: fonts.bodySemi, color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, marginTop: 1 },
  total: { fontFamily: fonts.serif, fontSize: 14, color: colors.forest, marginTop: 3 },
  badge: { backgroundColor: '#FDF4EE', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  badgeTxt: { color: colors.persimmonDark, fontSize: 11, fontFamily: fonts.bodyBold },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30, gap: 6 },
  emptyH: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 8 },
  emptyS: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  shopBtn: { marginTop: 18, backgroundColor: colors.persimmon, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 13 },
  shopBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  signCard: { marginHorizontal: 18, marginTop: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, ...shadow.soft },
  signH: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  signS: { color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  signBtn: { marginTop: 12, backgroundColor: colors.forest, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  signBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  orLabel: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 16 },
  lookup: { marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, gap: 8, ...shadow.soft },
  input: { backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  lookupBtn: { backgroundColor: colors.persimmon, borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center', marginTop: 2 },
  lookupBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
});
