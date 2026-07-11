import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../src/theme';
import { requestOtp, verifyOtp } from '../src/api';
import { useSession } from '../src/session';

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!/\S+@\S+\.\S+/.test(email.trim())) return Alert.alert('E-posta', 'Geçerli bir e-posta girin.');
    setBusy(true);
    try {
      await requestOtp(email.trim().toLowerCase());
      setStep('code');
    } catch (e: any) {
      Alert.alert('Kod gönderilemedi', e?.message ?? '');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.trim().length < 4) return Alert.alert('Kod', '6 haneli kodu girin.');
    setBusy(true);
    try {
      const r = await verifyOtp(email.trim().toLowerCase(), code.trim());
      await session.signIn(r.accessToken, email.trim().toLowerCase());
      router.back();
    } catch (e: any) {
      Alert.alert('Doğrulanamadı', e?.message ?? 'Kod hatalı ya da süresi dolmuş.');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.close}>✕</Text></Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.logo}>Kabzı<Text style={{ color: colors.persimmon }}>Mall</Text></Text>
        <Text style={styles.h}>{step === 'email' ? 'E-posta ile giriş' : 'Doğrulama kodu'}</Text>
        <Text style={styles.s}>
          {step === 'email'
            ? 'Sana 6 haneli bir giriş kodu göndereceğiz.'
            : `${email} adresine gönderilen kodu gir.`}
        </Text>

        {step === 'email' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="ornek@eposta.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none" keyboardType="email-address" autoFocus
              value={email} onChangeText={setEmail}
            />
            <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={sendCode} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnTxt}>Kod gönder</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="••••••"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad" maxLength={6} autoFocus
              value={code} onChangeText={setCode}
            />
            <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={verify} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnTxt}>Doğrula ve gir</Text>}
            </Pressable>
            <Pressable onPress={() => setStep('email')}><Text style={styles.link}>E-postayı değiştir</Text></Pressable>
          </>
        )}

        <Text style={styles.devNote}>
          Geliştirme modu: SMTP ayarlı değilse kod, API konsoluna yazılır (LOG modu).
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  top: { paddingHorizontal: 18, paddingBottom: 4, alignItems: 'flex-end' },
  close: { fontSize: 20, color: colors.muted },
  body: { paddingHorizontal: 22, paddingTop: 20 },
  logo: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, textAlign: 'center' },
  h: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginTop: 24 },
  s: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 15, paddingVertical: 14,
    fontFamily: fonts.body, fontSize: 15, color: colors.ink, marginTop: 20, ...shadow.soft,
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center', fontFamily: fonts.bodyBold },
  btn: { backgroundColor: colors.persimmon, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  btnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 15 },
  link: { color: colors.persimmon, fontFamily: fonts.bodySemi, fontSize: 13, textAlign: 'center', marginTop: 16 },
  devNote: { color: colors.muted, fontSize: 11, marginTop: 28, lineHeight: 16, textAlign: 'center' },
});
