import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../src/theme';
import { useSession } from '../src/session';
import { useAsync } from '../src/hooks';
import { listAddresses, createAddress, deleteAddress, type SavedAddress } from '../src/api';
import { MapPicker } from '../components/MapPicker';
import { useToast } from '../components/ui';

const LABELS = ['Ev', 'İş', 'Diğer'];

export default function Addresses() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSession();
  const toast = useToast();
  const token = session.token;

  const addrs = useAsync<SavedAddress[]>(() => (token ? listAddresses(token) : Promise.resolve([])), [token]);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Ev');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [district, setDistrict] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setLabel('Ev'); setName(''); setPhone(''); setAddressText(''); setDistrict(''); setGeo(null);
  };

  const save = async () => {
    if (!token) return;
    if (name.trim().length < 2) return Alert.alert('Eksik', 'Ad soyad girin.');
    if (phone.trim().length < 10) return Alert.alert('Eksik', 'Telefon girin.');
    if (addressText.trim().length < 5) return Alert.alert('Eksik', 'Açık adres girin.');
    if (!geo) return Alert.alert('Konum', 'Haritadan konumu işaretleyin.');
    setSaving(true);
    try {
      await createAddress(token, {
        label, name: name.trim(), phone: phone.trim(), addressText: addressText.trim(),
        district: district.trim() || null, lat: geo.lat, lng: geo.lng,
        isDefault: (addrs.data?.length ?? 0) === 0,
      });
      toast('Adres kaydedildi');
      setAdding(false); resetForm(); addrs.refetch();
    } catch (e: any) {
      Alert.alert('Kaydedilemedi', e?.message ?? '');
    } finally { setSaving(false); }
  };

  const remove = (a: SavedAddress) => {
    Alert.alert('Adresi sil', `“${a.label}” adresini silmek istiyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try { await deleteAddress(token!, a.id); toast('Adres silindi'); addrs.refetch(); }
          catch (e: any) { Alert.alert('Silinemedi', e?.message ?? ''); }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.headerTitle}>Adreslerim</Text>
          <View style={{ width: 20 }} />
        </View>

        {!token ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 52 }}>📍</Text>
            <Text style={styles.emptyH}>Adreslerini görmek için giriş yap</Text>
            <Text style={styles.emptyS}>E-posta ile giriş yapınca adreslerin tüm cihazlarında görünür.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push('/giris')}>
              <Text style={styles.primaryBtnTxt}>Giriş yap</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {addrs.loading ? (
              <ActivityIndicator color={colors.forest} style={{ marginTop: 30 }} />
            ) : (
              <>
                {(addrs.data ?? []).map((a) => (
                  <View key={a.id} style={styles.card}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardTop}>
                        <Text style={styles.cardLabel}>{a.label}</Text>
                        {a.isDefault ? <View style={styles.defBadge}><Text style={styles.defBadgeTxt}>varsayılan</Text></View> : null}
                      </View>
                      <Text style={styles.cardName}>{a.name} · {a.phone}</Text>
                      <Text style={styles.cardAddr}>{a.addressText}{a.district ? `, ${a.district}` : ''}</Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => remove(a)}><Text style={styles.del}>🗑️</Text></Pressable>
                  </View>
                ))}
                {(addrs.data?.length ?? 0) === 0 && !adding ? (
                  <Text style={styles.hint}>Henüz kayıtlı adresin yok. Aşağıdan ekleyebilirsin.</Text>
                ) : null}

                {adding ? (
                  <View style={styles.form}>
                    <Text style={styles.formH}>Yeni adres</Text>
                    <View style={styles.chipRow}>
                      {LABELS.map((l) => (
                        <Pressable key={l} style={[styles.chip, label === l && styles.chipSel]} onPress={() => setLabel(l)}>
                          <Text style={[styles.chipTxt, label === l && { color: colors.white }]}>{l}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput style={styles.input} placeholder="Ad Soyad" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
                    <TextInput style={styles.input} placeholder="Telefon (05XX XXX XX XX)" placeholderTextColor={colors.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                    <TextInput style={[styles.input, { minHeight: 44 }]} placeholder="Açık adres (mahalle, cadde, kapı no)" placeholderTextColor={colors.muted} value={addressText} onChangeText={setAddressText} multiline />
                    <TextInput style={styles.input} placeholder="İlçe (opsiyonel)" placeholderTextColor={colors.muted} value={district} onChangeText={setDistrict} />
                    <Text style={styles.mapLabel}>Haritada konum {geo ? '✓' : '* zorunlu'}</Text>
                    <MapPicker lat={geo?.lat ?? null} lng={geo?.lng ?? null} onChange={(lat, lng) => setGeo({ lat, lng })} />
                    <View style={styles.formBtns}>
                      <Pressable style={styles.ghostBtn} onPress={() => { setAdding(false); resetForm(); }}>
                        <Text style={styles.ghostBtnTxt}>Vazgeç</Text>
                      </Pressable>
                      <Pressable style={[styles.primaryBtn, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                        {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnTxt}>Kaydet</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.addBtn} onPress={() => setAdding(true)}>
                    <Text style={styles.addBtnTxt}>＋ Yeni adres ekle</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30, gap: 6 },
  emptyH: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 8, textAlign: 'center' },
  emptyS: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  card: {
    marginHorizontal: 18, marginTop: 10, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  defBadge: { backgroundColor: '#eaf3ea', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  defBadgeTxt: { color: colors.forest, fontSize: 10, fontFamily: fonts.bodySemi },
  cardName: { fontSize: 12.5, color: colors.ink, marginTop: 4 },
  cardAddr: { fontSize: 12, color: colors.muted, marginTop: 2 },
  del: { fontSize: 18 },
  hint: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 20, paddingHorizontal: 24 },
  addBtn: { marginHorizontal: 18, marginTop: 14, borderWidth: 1.5, borderColor: colors.forest, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  addBtnTxt: { color: colors.forest, fontFamily: fonts.bodyBold, fontSize: 14 },
  form: { marginHorizontal: 18, marginTop: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  formH: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  chipSel: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipTxt: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.ink },
  input: {
    backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, marginBottom: 9,
  },
  mapLabel: { fontSize: 12, color: colors.muted, marginBottom: 8, fontFamily: fonts.bodySemi },
  formBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ghostBtn: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: radius.sm, backgroundColor: colors.creamDark, alignItems: 'center', justifyContent: 'center' },
  ghostBtnTxt: { color: colors.ink, fontFamily: fonts.bodySemi, fontSize: 13.5 },
  primaryBtn: { backgroundColor: colors.persimmon, borderRadius: radius.sm, paddingVertical: 13, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
});
