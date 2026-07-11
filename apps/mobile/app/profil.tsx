import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../src/theme';
import { tl, orderTotal } from '../src/format';
import { myOrders } from '../src/api';
import { useSession } from '../src/session';
import { useAsync } from '../src/hooks';
import { useToast } from '../components/ui';
import type { Order } from '../src/types';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const toast = useToast();
  const token = session.token;

  const orders = useAsync<Order[]>(
    () => (token ? myOrders(token).then((r) => r.data) : Promise.resolve([])),
    [token],
  );

  const list = orders.data ?? [];
  const delivered = list.filter((o) => o.status === 'DELIVERED');
  const spent = delivered.reduce((s, o) => s + orderTotal(o), 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Profil bilgilerim</Text>
        <View style={{ width: 20 }} />
      </View>

      {!token ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 52 }}>👤</Text>
          <Text style={styles.emptyH}>Giriş yapılmadı</Text>
          <Text style={styles.emptyS}>E-posta ile giriş yap; profilini ve sipariş geçmişini tüm cihazlarında gör.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/giris')}>
            <Text style={styles.primaryBtnTxt}>Giriş yap</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <LinearGradient colors={[colors.moss, colors.forest]} style={styles.avatar}>
              <Text style={styles.avatarTxt}>{(session.email ?? '?')[0].toUpperCase()}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>KabzıMall müşterisi</Text>
              <Text style={styles.email}>{session.email}</Text>
            </View>
          </View>

          {orders.loading ? (
            <ActivityIndicator color={colors.forest} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.stat}><Text style={styles.statNum}>{list.length}</Text><Text style={styles.statLabel}>sipariş</Text></View>
              <View style={styles.stat}><Text style={styles.statNum}>{delivered.length}</Text><Text style={styles.statLabel}>teslim</Text></View>
              <View style={styles.stat}><Text style={styles.statNum}>{tl(spent)}</Text><Text style={styles.statLabel}>harcama</Text></View>
            </View>
          )}

          <Pressable style={styles.linkRow} onPress={() => router.push('/adreslerim')}>
            <Text style={styles.linkIcon}>📍</Text><Text style={styles.linkLabel}>Adreslerim</Text><Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.linkRow} onPress={() => router.replace('/siparisler')}>
            <Text style={styles.linkIcon}>📦</Text><Text style={styles.linkLabel}>Siparişlerim</Text><Text style={styles.chevron}>›</Text>
          </Pressable>

          <Text style={styles.note}>
            Hesabın e-posta ile doğrulanır; profil verilerin siparişlerinden oluşur. Kişisel verilerinin
            silinmesini istersen Yardım'dan bize yazabilirsin.
          </Text>

          <Pressable style={styles.logout} onPress={() => { session.signOut(); toast('Çıkış yapıldı'); router.back(); }}>
            <Text style={styles.logoutTxt}>Çıkış yap</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30, gap: 6 },
  emptyH: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 8 },
  emptyS: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.persimmon, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 13, marginTop: 14 },
  primaryBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  card: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft,
  },
  avatar: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.white, fontSize: 24, fontFamily: fonts.serif },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  email: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  statsRow: { flexDirection: 'row', marginHorizontal: 18, marginTop: 12, backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 16, ...shadow.soft },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontFamily: fonts.serif, fontSize: 18, color: colors.forest },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  linkRow: {
    marginHorizontal: 18, marginTop: 10, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft,
  },
  linkIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  linkLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.ink },
  chevron: { color: colors.muted, fontSize: 18 },
  note: { color: colors.muted, fontSize: 11.5, textAlign: 'center', marginTop: 16, paddingHorizontal: 22, lineHeight: 17 },
  logout: { alignItems: 'center', paddingVertical: 18 },
  logoutTxt: { color: colors.berry, fontFamily: fonts.bodyBold, fontSize: 13 },
});
