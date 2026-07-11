import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius, shadow } from '../src/theme';
import { tl } from '../src/format';
import { useCart } from '../src/cart';
import { useAsync } from '../src/hooks';
import { getSlots, getZones, getSettings, checkCoupon, createOrder } from '../src/api';
import { deliveryFee } from '../src/delivery';
import { MapPicker } from '../components/MapPicker';
import type { Slot, Zone, StoreSettings, CouponResult } from '../src/types';

/** İki nokta arası kuş uçuşu km (haversine) — uzak-pin teyidi için (web ile aynı). */
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const PAYS: { key: 'CARD' | 'CASH'; icon: string; title: string; sub: string }[] = [
  { key: 'CARD', icon: '💳', title: 'Kapıda kredi / banka kartı', sub: 'kuryenin POS cihazı' },
  { key: 'CASH', icon: '💵', title: 'Kapıda nakit', sub: 'teslimatta öde' },
];

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const params = useLocalSearchParams<{ sub?: string }>();
  const substitutionPref = (params.sub as 'CALL' | 'REMOVE' | 'SUBSTITUTE') ?? 'SUBSTITUTE';

  const slots = useAsync<Slot[]>(() => getSlots().catch(() => []), []);
  const zones = useAsync<Zone[]>(() => getZones().catch(() => []), []);
  const settings = useAsync<StoreSettings>(() => getSettings().catch(() => null as any), []);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [district, setDistrict] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoSelf, setGeoSelf] = useState<{ lat: number; lng: number } | null>(null);
  const [slotIdx, setSlotIdx] = useState(0);
  const [pay, setPay] = useState<'CARD' | 'CASH'>('CARD');
  const [coupon, setCoupon] = useState('');
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = cart.subtotal;
  const discount = couponResult?.valid ? couponResult.discount : 0;
  const deliv = deliveryFee(Math.max(0, subtotal - discount), settings.data?.deliveryTiers);
  const total = Math.max(0, subtotal - discount) + deliv;

  const zoneList = zones.data ?? [];

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    try {
      const r = await checkCoupon(coupon.trim(), subtotal);
      setCouponResult(r);
      if (!r.valid) Alert.alert('Kupon', r.message ?? 'Kupon uygulanamadı.');
    } catch (e: any) {
      Alert.alert('Kupon', e?.message ?? 'Kupon kontrol edilemedi.');
    }
  };

  // Kuponlarım'da kaydedilen kuponu ödemede otomatik doldur + sessizce uygula.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem('km_saved_coupon').then(async (c) => {
      if (!c || !alive) return;
      setCoupon(c);
      try {
        const r = await checkCoupon(c, cart.subtotal);
        if (alive && r.valid) setCouponResult(r);
      } catch { /* sessiz */ }
    });
    return () => { alive = false; };
    // yalnız bir kez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geoRequired = settings.data?.requireGeo !== false; // varsayılan: harita konumu zorunlu

  const placeOrder = async () => {
    const slot = slots.data?.[slotIdx];
    setSubmitting(true);
    try {
      const order = await createOrder({
        items: cart.lines.map((l) => ({ slug: l.slug, qty: l.qty, note: l.note })),
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          district: district ?? undefined,
          email: email.trim() || undefined,
          lat: geo?.lat,
          lng: geo?.lng,
        },
        slot: slot ? { date: slot.date, window: slot.window } : undefined,
        substitutionPref,
        couponCode: couponResult?.valid ? coupon.trim() : undefined,
        paymentMethod: pay,
      });
      cart.clear();
      router.replace(`/siparis/${order.id}?new=1`);
    } catch (e: any) {
      Alert.alert('Sipariş oluşturulamadı', e?.message ?? 'Bilinmeyen hata.');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert('Eksik bilgi', 'Ad soyad girin.');
    if (phone.trim().length < 10) return Alert.alert('Eksik bilgi', 'Cep telefonu girin (05XX XXX XX XX).');
    if (address.trim().length < 5) return Alert.alert('Eksik bilgi', 'Açık adres girin.');
    if (zoneList.length > 0 && !district) return Alert.alert('İlçe', 'Teslimat ilçesini seçin.');
    if (geoRequired && !geo) return Alert.alert('Konum', 'Kuryenin sizi bulabilmesi için haritadan konumunuzu işaretleyin.');

    // Pin, cihazın gerçek konumundan belirgin uzaktaysa (>250 m) teyit iste (web ile aynı).
    if (geo && geoSelf) {
      const far = distKm(geo, geoSelf);
      if (far > 0.25) {
        Alert.alert(
          'Konumu doğrula',
          `Seçtiğiniz teslimat noktası şu anki konumunuzdan ~${far < 10 ? far.toFixed(1).replace('.', ',') : Math.round(far)} km uzakta. Doğru mu?`,
          [
            { text: 'Haritaya dön', style: 'cancel' },
            { text: 'Evet, doğru', onPress: placeOrder },
          ],
        );
        return;
      }
    }
    placeOrder();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.headerTitle}>Teslimat & Ödeme</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Adres */}
          <View style={styles.block}>
            <Text style={styles.blockH}>📍 Teslimat adresi</Text>
            <Field placeholder="Ad Soyad" value={name} onChangeText={setName} />
            <Field placeholder="Cep telefonu (05XX XXX XX XX)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field placeholder="Açık adres (mahalle, cadde, kapı no)" value={address} onChangeText={setAddress} multiline />
            <Field placeholder="E-posta (opsiyonel — sipariş bildirimleri)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            {zoneList.length > 0 ? (
              <>
                <Text style={styles.subLabel}>İlçe</Text>
                <View style={styles.chipRow}>
                  {zoneList.map((z) => (
                    <Pressable key={z.name} style={[styles.zchip, district === z.name && styles.zchipSel]} onPress={() => setDistrict(z.name)}>
                      <Text style={[styles.zchipTxt, district === z.name && { color: colors.white }]}>{z.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>

          {/* Haritada konum */}
          <View style={styles.block}>
            <View style={styles.mapHeadRow}>
              <Text style={styles.blockH}>🗺️ Haritada konum</Text>
              {geo ? (
                <Text style={styles.geoOk}>✓ işaretlendi</Text>
              ) : geoRequired ? (
                <Text style={styles.geoReq}>* zorunlu</Text>
              ) : null}
            </View>
            <MapPicker
              lat={geo?.lat ?? null}
              lng={geo?.lng ?? null}
              onChange={(lat, lng) => setGeo({ lat, lng })}
              onGeolocate={(lat, lng) => setGeoSelf({ lat, lng })}
            />
            <Text style={styles.geoNote}>Kuryenin sizi kolayca bulması için teslimat noktasını işaretleyin.</Text>
          </View>

          {/* Teslimat saati */}
          <View style={styles.block}>
            <Text style={styles.blockH}>🕑 Teslimat saati</Text>
            {slots.loading ? (
              <ActivityIndicator color={colors.forest} />
            ) : (slots.data ?? []).length === 0 ? (
              <Text style={styles.muted}>Uygun slot bulunamadı.</Text>
            ) : (
              (slots.data ?? []).map((s, i) => (
                <Choice key={`${s.date}-${s.window}`} selected={slotIdx === i} onPress={() => setSlotIdx(i)} title={s.label} />
              ))
            )}
          </View>

          {/* Ödeme */}
          <View style={styles.block}>
            <Text style={styles.blockH}>💳 Ödeme yöntemi</Text>
            {PAYS.map((p) => (
              <Choice key={p.key} selected={pay === p.key} onPress={() => setPay(p.key)} title={`${p.icon}  ${p.title}`} sub={p.sub} />
            ))}
            <Text style={styles.muted}>Online ödeme henüz yok — tüm ödemeler kapıda tahsil edilir.</Text>
          </View>

          {/* Kupon */}
          <View style={styles.block}>
            <Text style={styles.blockH}>🎟️ Kupon kodu</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Kupon kodu"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                value={coupon}
                onChangeText={(t) => { setCoupon(t); setCouponResult(null); }}
              />
              <Pressable style={styles.applyBtn} onPress={applyCoupon}><Text style={styles.applyTxt}>Uygula</Text></Pressable>
            </View>
            {couponResult?.valid ? <Text style={styles.couponOk}>✓ {tl(couponResult.discount)} indirim uygulandı</Text> : null}
          </View>

          {/* Özet */}
          <View style={styles.summary}>
            <SumRow label="Ürünler" value={tl(subtotal)} />
            {discount > 0 ? <SumRow label="Kupon indirimi" value={`−${tl(discount)}`} highlight /> : null}
            <SumRow label="Teslimat" value={deliv === 0 ? 'Ücretsiz' : tl(deliv)} highlight={deliv === 0} />
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Ödenecek</Text>
              <Text style={styles.totalValue}>{tl(total)}</Text>
            </View>
            <Text style={styles.note}>Tartılı ürünlerde nihai tutar paketlemede gramajla kesinleşir.</Text>
          </View>
        </ScrollView>

        <View style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable style={[styles.cta, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.ctaTxt}>Siparişi onayla · {tl(total)}</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      style={[styles.input, props.multiline && { minHeight: 60, textAlignVertical: 'top' }, props.style]}
      placeholderTextColor={colors.muted}
    />
  );
}

function Choice({ selected, onPress, title, sub }: { selected: boolean; onPress: () => void; title: string; sub?: string }) {
  return (
    <Pressable style={[styles.choice, selected && styles.choiceSel]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {sub ? <Text style={styles.choiceSub}>{sub}</Text> : null}
      </View>
      <Text style={[styles.chk, selected && { opacity: 1 }]}>✓</Text>
    </Pressable>
  );
}

function SumRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.ln}>
      <Text style={styles.lnLabel}>{label}</Text>
      <Text style={[styles.lnValue, highlight && { color: colors.honey }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 8,
  },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  block: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  blockH: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.ink, marginBottom: 10 },
  input: {
    backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 13, color: colors.ink, marginBottom: 8,
  },
  subLabel: { fontSize: 11, color: colors.muted, marginBottom: 6, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zchip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  zchipSel: { backgroundColor: colors.forest, borderColor: colors.forest },
  zchipTxt: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.ink },
  geoNote: { fontSize: 10.5, color: colors.muted, marginTop: 8 },
  mapHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  geoOk: { color: colors.forest, fontFamily: fonts.bodySemi, fontSize: 11.5 },
  geoReq: { color: colors.berry, fontFamily: fonts.bodyBold, fontSize: 11.5 },
  muted: { fontSize: 11.5, color: colors.muted, marginTop: 4 },
  choice: {
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center',
  },
  choiceSel: { borderColor: colors.persimmon, backgroundColor: '#FDF4EE' },
  choiceTitle: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.ink },
  choiceSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  chk: { color: colors.persimmon, fontFamily: fonts.bodyBold, opacity: 0, fontSize: 15 },
  applyBtn: { backgroundColor: colors.forest, borderRadius: radius.sm, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  applyTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 13 },
  couponOk: { color: colors.forest, fontFamily: fonts.bodySemi, fontSize: 12, marginTop: 8 },
  summary: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.forest, borderRadius: radius.xl, padding: 18, ...shadow.card },
  ln: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  lnLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  lnValue: { color: colors.white, fontSize: 13, fontFamily: fonts.bodyMed },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: fonts.serif, fontSize: 18, color: colors.white },
  totalValue: { fontFamily: fonts.serif, fontSize: 18, color: colors.white },
  note: { fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 15 },
  ctaWrap: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: colors.line },
  cta: { backgroundColor: colors.persimmon, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  ctaTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14.5 },
});
