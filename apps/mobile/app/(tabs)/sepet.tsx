import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../../src/theme';
import { tl, qtyLabel } from '../../src/format';
import { useCart } from '../../src/cart';
import { useAsync } from '../../src/hooks';
import { getSettings } from '../../src/api';
import { deliveryFee, freeDeliveryThreshold } from '../../src/delivery';
import type { StoreSettings } from '../../src/types';

type SubPref = 'SUBSTITUTE' | 'CALL' | 'REMOVE';
const SUB_LABELS: Record<SubPref, string> = {
  SUBSTITUTE: 'Benzer ürünle değiştir',
  CALL: 'Beni arayarak sor',
  REMOVE: 'Eksik ürünü çıkar',
};

export default function Cart() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const [sub, setSub] = useState<SubPref>('SUBSTITUTE');
  const settings = useAsync<StoreSettings>(() => getSettings().catch(() => null as any), []);

  if (cart.count === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Sepetim</Text>
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>🧺</Text>
          <Text style={styles.emptyH}>Sepetin boş</Text>
          <Text style={styles.emptyS}>Taze ürünleri keşfetmeye başla.</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.push('/')}>
            <Text style={styles.emptyBtnTxt}>Alışverişe başla</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const subtotal = cart.subtotal;
  const tiers = settings.data?.deliveryTiers;
  const deliv = deliveryFee(subtotal, tiers);
  const total = subtotal + deliv;
  const freeAt = freeDeliveryThreshold(tiers);
  const toFree = freeAt != null && subtotal < freeAt ? freeAt - subtotal : 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>
          Sepetim <Text style={styles.titleCount}>· {cart.count} ürün</Text>
        </Text>

        {cart.lines.map((it) => (
          <View key={it.slug} style={styles.citem}>
            <View style={styles.citemRow}>
              <View style={styles.itemPh}><Text style={{ fontSize: 26 }}>{it.emoji}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNm}>{it.name}</Text>
                <Text style={styles.itemMeta}>
                  {qtyLabel(it.qty, it.unitLabel)}{it.saleType === 'WEIGHT' && !it.isBasket ? ' · tartılı' : ''}
                </Text>
                <Text style={styles.itemPr}>{tl(Math.round(it.unitPrice * it.qty))}</Text>
              </View>
              <View style={styles.qbox}>
                <Pressable onPress={() => cart.step(it.slug, -1)} hitSlop={8}><Text style={styles.qbtn}>−</Text></Pressable>
                <Text style={styles.qval}>{it.saleType === 'WEIGHT' ? it.qty.toLocaleString('tr-TR') : it.qty}</Text>
                <Pressable onPress={() => cart.step(it.slug, 1)} hitSlop={8}><Text style={styles.qbtn}>+</Text></Pressable>
              </View>
            </View>
            {!it.isBasket ? (
              <View style={styles.noteRow}>
                <Text style={styles.noteIcon}>📝</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Ürün notu ekle (ör. olgun seçilsin)"
                  placeholderTextColor={colors.muted}
                  value={it.note ?? ''}
                  onChangeText={(t) => cart.setNote(it.slug, t)}
                  maxLength={200}
                />
              </View>
            ) : null}
          </View>
        ))}

        {/* Eksik ürün tercihi */}
        <View style={styles.prefcard}>
          <Text style={styles.prefT}>Bir ürün stokta kalmazsa?</Text>
          {(Object.keys(SUB_LABELS) as SubPref[]).map((k) => {
            const on = sub === k;
            return (
              <Pressable key={k} style={styles.opt} onPress={() => setSub(k)}>
                <View style={[styles.rad, on && styles.radOn]}>{on ? <View style={styles.radDot} /> : null}</View>
                <Text style={[styles.optTxt, on && styles.optTxtOn]}>{SUB_LABELS[k]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Özet */}
        <View style={styles.summary}>
          <Row label="Ara toplam" value={tl(subtotal)} />
          <Row label="Teslimat" value={deliv === 0 ? 'Ücretsiz' : tl(deliv)} highlight={deliv === 0} />
          {toFree > 0 ? (
            <Text style={styles.note}>🚚 {tl(toFree)} daha ekle, teslimat ücretsiz olsun.</Text>
          ) : null}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>{tl(total)}</Text>
          </View>
          <Text style={styles.note}>⚖️ Tartılı ürünlerde nihai tutar paketleme sonrası gramaja göre güncellenir. Kupon kodu ödeme adımında uygulanır.</Text>
        </View>
      </ScrollView>

      <View style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.cta} onPress={() => router.push(`/odeme?sub=${sub}`)}>
          <Text style={styles.ctaTxt}>Teslimat & ödemeye geç →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.ln}>
      <Text style={styles.lnLabel}>{label}</Text>
      <Text style={[styles.lnValue, highlight && { color: colors.honey }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  title: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink, paddingHorizontal: 18, paddingBottom: 4 },
  titleCount: { fontSize: 12, color: colors.muted, fontFamily: fonts.body },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30, gap: 6 },
  emptyH: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 8 },
  emptyS: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  emptyBtn: { marginTop: 18, backgroundColor: colors.persimmon, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 13 },
  emptyBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  citem: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.lg,
    padding: 11, ...shadow.soft,
  },
  citemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  noteIcon: { fontSize: 14 },
  noteInput: {
    flex: 1, backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 10,
    paddingVertical: 8, fontFamily: fonts.body, fontSize: 12.5, color: colors.ink,
  },
  itemPh: {
    width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.creamDark,
    alignItems: 'center', justifyContent: 'center',
  },
  itemNm: { fontSize: 13.5, fontFamily: fonts.bodySemi, color: colors.ink },
  itemMeta: { fontSize: 11, color: colors.muted, marginTop: 1 },
  itemPr: { fontFamily: fonts.serif, fontSize: 14, color: colors.forest, marginTop: 3 },
  qbox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cream,
    borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5,
  },
  qbtn: { fontSize: 17, color: colors.forest, width: 14, textAlign: 'center' },
  qval: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.ink, minWidth: 22, textAlign: 'center' },
  prefcard: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  prefT: { fontSize: 12.5, fontFamily: fonts.bodyBold, color: colors.ink, marginBottom: 6 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  rad: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#D8D0BF', alignItems: 'center', justifyContent: 'center' },
  radOn: { borderColor: colors.persimmon },
  radDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.persimmon },
  optTxt: { fontSize: 12.5, color: colors.muted },
  optTxtOn: { color: colors.ink, fontFamily: fonts.bodySemi },
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
