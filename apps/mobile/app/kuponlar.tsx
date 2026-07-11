import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius, shadow } from '../src/theme';
import { tl } from '../src/format';
import { checkCoupon } from '../src/api';
import { useCart } from '../src/cart';
import { useToast } from '../components/ui';
import type { CouponResult } from '../src/types';

export const SAVED_COUPON_KEY = 'km_saved_coupon';

export default function Coupons() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CouponResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => { AsyncStorage.getItem(SAVED_COUPON_KEY).then(setSaved).catch(() => {}); }, []);

  const check = async () => {
    const c = code.trim();
    if (!c) return;
    setChecking(true);
    try {
      const r = await checkCoupon(c, cart.subtotal);
      setResult(r);
      if (r.valid) {
        await AsyncStorage.setItem(SAVED_COUPON_KEY, c.toUpperCase());
        setSaved(c.toUpperCase());
        toast('Kupon kaydedildi — ödemede uygulanır');
      }
    } catch (e: any) {
      setResult({ valid: false, discount: 0, message: e?.message ?? 'Kontrol edilemedi' });
    } finally { setChecking(false); }
  };

  const removeSaved = async () => {
    await AsyncStorage.removeItem(SAVED_COUPON_KEY);
    setSaved(null); setResult(null); setCode('');
    toast('Kayıtlı kupon kaldırıldı');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.headerTitle}>Kuponlarım</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {saved ? (
            <View style={styles.savedCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedLabel}>Kayıtlı kupon</Text>
                <Text style={styles.savedCode}>{saved}</Text>
                <Text style={styles.savedNote}>Ödeme adımında otomatik uygulanır.</Text>
              </View>
              <Pressable onPress={removeSaved} hitSlop={8}><Text style={styles.remove}>Kaldır</Text></Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardH}>Kupon kodu gir</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Ör. HOSGELDIN10"
                placeholderTextColor={colors.muted}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable style={[styles.checkBtn, checking && { opacity: 0.6 }]} onPress={check} disabled={checking}>
                {checking ? <ActivityIndicator color={colors.white} /> : <Text style={styles.checkBtnTxt}>Kontrol et</Text>}
              </Pressable>
            </View>
            {result ? (
              <View style={[styles.resultBox, result.valid ? styles.resultOk : styles.resultBad]}>
                <Text style={[styles.resultTxt, { color: result.valid ? colors.forest : colors.berry }]}>
                  {result.valid
                    ? `✓ Geçerli — ${tl(result.discount)} indirim`
                    : `✕ ${result.message ?? 'Kupon uygulanamadı'}`}
                </Text>
              </View>
            ) : null}
            <Text style={styles.hint}>
              İndirim, sepetindeki tutara göre ödemede kesinleşir. Kupon kodları büyük/küçük harfe duyarlı değildir.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoH}>💡 Telafi kuponların</Text>
            <Text style={styles.infoTxt}>
              Bir siparişte eksik/bozuk ürün bildirdiğinde otomatik üretilen <Text style={{ fontFamily: fonts.bodySemi, color: colors.ink }}>TELAFI-</Text> kodları burada girip kaydedebilirsin; bir sonraki siparişinde geçerlidir.
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  savedCard: {
    marginHorizontal: 18, marginTop: 10, backgroundColor: colors.forest, borderRadius: radius.lg, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.soft,
  },
  savedLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  savedCode: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 20, marginTop: 3, letterSpacing: 1 },
  savedNote: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 4 },
  remove: { color: colors.honey, fontFamily: fonts.bodyBold, fontSize: 12.5 },
  card: { marginHorizontal: 18, marginTop: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  cardH: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 12,
    fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink, letterSpacing: 0.5,
  },
  checkBtn: { backgroundColor: colors.persimmon, borderRadius: radius.sm, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  checkBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 13 },
  resultBox: { borderRadius: radius.sm, padding: 11, marginTop: 10 },
  resultOk: { backgroundColor: '#eaf3ea' },
  resultBad: { backgroundColor: '#fbeceb' },
  resultTxt: { fontFamily: fonts.bodySemi, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 10 },
  infoCard: { marginHorizontal: 18, marginTop: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.honey, ...shadow.soft },
  infoH: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink, marginBottom: 5 },
  infoTxt: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
});
