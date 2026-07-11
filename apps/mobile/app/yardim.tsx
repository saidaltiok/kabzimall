import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../src/theme';
import { useSession } from '../src/session';
import { sendSupport } from '../src/api';
import { useToast } from '../components/ui';

const FAQ: { q: string; a: string }[] = [
  { q: 'Nasıl sipariş veririm?', a: 'Ürünleri sepete ekle, “Teslimat & ödemeye geç” de; adres ve teslimat saatini seçip siparişi onayla. Üyelik gerekmez.' },
  { q: 'Ödeme nasıl?', a: 'Şimdilik yalnız kapıda ödeme: nakit ya da kuryenin POS cihazıyla kart. Online ödeme ileride eklenecek.' },
  { q: 'Teslimat ne zaman gelir?', a: 'Ödeme adımında seçtiğin teslimat penceresinde (ör. 13:00–16:00) gelir. Siparişini “Siparişler”den canlı takip edebilirsin.' },
  { q: 'Tartılı üründe tutar neden değişebilir?', a: 'Meyve-sebze gramajla satılır; sepetteki tutar tahminidir. Paketlemede gerçek gramaj tartılır ve tutar kesinleşir.' },
  { q: 'Bir ürün stokta kalmazsa?', a: 'Sepette tercihini seçersin: benzer ürünle değiştir, seni ara ya da o ürünü çıkar. Paketlemede tercihin uygulanır.' },
  { q: 'Eksik/bozuk ürün gelirse?', a: 'Teslimden sonra 24 saat içinde sipariş takip ekranından “Bir sorun mu var?” ile bildir; uygun durumda anında telafi kuponu tanımlanır.' },
  { q: 'Siparişimi iptal edebilir miyim?', a: 'Sipariş hazırlanmaya başlamadan iptal edebilirsin. Sipariş takip ekranındaki “Siparişi iptal et” butonunu kullan.' },
];

export default function Help() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const toast = useToast();

  const [open, setOpen] = useState<number | null>(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(session.email ?? '');
  const [orderCode, setOrderCode] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert('Eksik', 'Adını gir.');
    if (!/.+@.+\..+/.test(email.trim())) return Alert.alert('Eksik', 'Geçerli bir e-posta gir.');
    if (message.trim().length < 5) return Alert.alert('Eksik', 'Mesajını yaz.');
    setSending(true);
    try {
      await sendSupport({ name: name.trim(), email: email.trim(), orderCode: orderCode.trim() || undefined, message: message.trim() });
      toast('Mesajın gönderildi 🙌');
      setMessage(''); setOrderCode('');
    } catch (e: any) {
      Alert.alert('Gönderilemedi', e?.message ?? '');
    } finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.headerTitle}>Yardım & SSS</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionH}>Sık sorulanlar</Text>
          <View style={styles.faqWrap}>
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <View key={i} style={[styles.faqItem, i > 0 && styles.faqDivider]}>
                  <Pressable style={styles.faqQRow} onPress={() => setOpen(isOpen ? null : i)}>
                    <Text style={styles.faqQ}>{item.q}</Text>
                    <Text style={styles.faqChevron}>{isOpen ? '▾' : '▸'}</Text>
                  </Pressable>
                  {isOpen ? <Text style={styles.faqA}>{item.a}</Text> : null}
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionH}>Bize yaz</Text>
          <View style={styles.form}>
            <Text style={styles.formHint}>Sorunu ya da önerini ilet; e-postandan sana döneriz.</Text>
            <TextInput style={styles.input} placeholder="Adın" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="E-posta" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Sipariş no (varsa, ör. KM3MO4DR3)" placeholderTextColor={colors.muted} value={orderCode} onChangeText={setOrderCode} autoCapitalize="characters" />
            <TextInput style={[styles.input, styles.msg]} placeholder="Mesajın" placeholderTextColor={colors.muted} value={message} onChangeText={setMessage} multiline maxLength={800} />
            <Pressable style={[styles.primaryBtn, sending && { opacity: 0.6 }]} onPress={submit} disabled={sending}>
              {sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnTxt}>Gönder</Text>}
            </Pressable>
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
  sectionH: { fontFamily: fonts.bodyBold, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.forest, paddingHorizontal: 20, marginTop: 18, marginBottom: 8 },
  faqWrap: { marginHorizontal: 18, backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 14, ...shadow.soft },
  faqItem: { paddingVertical: 13 },
  faqDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  faqQRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  faqQ: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.ink },
  faqChevron: { color: colors.muted, fontSize: 14 },
  faqA: { color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  form: { marginHorizontal: 18, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  formHint: { color: colors.muted, fontSize: 12.5, marginBottom: 10 },
  input: {
    backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, marginBottom: 9,
  },
  msg: { minHeight: 90, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: colors.persimmon, borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
});
