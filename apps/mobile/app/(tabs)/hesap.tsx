import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../../src/theme';
import { useSession } from '../../src/session';
import { useFavorites } from '../../src/favorites';
import { useToast } from '../../components/ui';

const ROWS: { icon: string; label: string; route?: string }[] = [
  { icon: '👤', label: 'Profil bilgilerim', route: '/profil' },
  { icon: '📍', label: 'Adreslerim', route: '/adreslerim' },
  { icon: '❤️', label: 'Favorilerim', route: '/favoriler' },
  { icon: '🎟️', label: 'Kuponlarım', route: '/kuponlar' },
  { icon: '🔔', label: 'Bildirim ayarları', route: '/bildirimler' },
  { icon: '🌐', label: 'Dil · Türkçe' },
  { icon: '❓', label: 'Yardım & SSS', route: '/yardim' },
  { icon: '📄', label: 'Yasal metinler', route: '/yasal' },
];

export default function Account() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const favs = useFavorites();
  const toast = useToast();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Hesabım</Text>

      {/* Profil kartı */}
      <View style={styles.profile}>
        <LinearGradient colors={[colors.moss, colors.forest]} style={styles.avatar}>
          <Text style={styles.avatarTxt}>{session.email ? session.email[0].toUpperCase() : '👤'}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          {session.email ? (
            <>
              <Text style={styles.pName}>Merhaba 👋</Text>
              <Text style={styles.pMeta}>{session.email}</Text>
            </>
          ) : (
            <>
              <Text style={styles.pName}>Giriş yapılmadı</Text>
              <Text style={styles.pMeta}>Siparişlerin için e-posta ile giriş yap</Text>
            </>
          )}
        </View>
        {!session.email ? (
          <Pressable style={styles.loginPill} onPress={() => router.push('/giris')}>
            <Text style={styles.loginPillTxt}>Giriş</Text>
          </Pressable>
        ) : null}
      </View>

      {ROWS.map(({ icon, label, route }) => {
        const isFavRow = label === 'Favorilerim';
        return (
          <Pressable
            key={label}
            style={styles.row}
            onPress={() => (route ? router.push(route as any) : toast('Şu an yalnız Türkçe'))}
          >
            <Text style={styles.rowIcon}>{icon}</Text>
            <Text style={styles.rowLabel}>{label}</Text>
            {isFavRow && favs.count > 0 ? (
              <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{favs.count}</Text></View>
            ) : null}
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      })}

      {session.email ? (
        <Pressable
          style={styles.logout}
          onPress={() => { session.signOut(); toast('Çıkış yapıldı'); }}
        >
          <Text style={styles.logoutTxt}>Çıkış yap</Text>
        </Pressable>
      ) : null}

      <Text style={styles.version}>KabzıMall · sürüm 0.1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  title: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink, paddingHorizontal: 18, paddingBottom: 4 },
  profile: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.lg, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft,
  },
  avatar: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.white, fontSize: 22, fontFamily: fonts.serif },
  pName: { fontSize: 14, fontFamily: fonts.bodySemi, color: colors.ink },
  pMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  loginPill: { backgroundColor: colors.persimmon, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 9 },
  loginPillTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 13 },
  row: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.lg, padding: 13,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft,
  },
  rowIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 13.5, fontFamily: fonts.bodySemi, color: colors.ink },
  chevron: { color: colors.muted, fontSize: 18 },
  countBadge: { backgroundColor: '#FBEEE6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 },
  countBadgeTxt: { color: colors.persimmonDark, fontSize: 11.5, fontFamily: fonts.bodyBold },
  logout: { alignItems: 'center', paddingVertical: 18 },
  logoutTxt: { color: colors.berry, fontFamily: fonts.bodyBold, fontSize: 13 },
  version: { textAlign: 'center', color: colors.muted, fontSize: 11, paddingBottom: 8 },
});
