import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../../src/theme';
import { getProduct } from '../../src/api';
import { useAsync } from '../../src/hooks';
import { emojiFor, tl, tlBare } from '../../src/format';
import { effectivePrice, oldPrice, discountPct, toCartLine } from '../../src/product';
import { Pill, productTags, useToast } from '../../components/ui';
import { useCart } from '../../src/cart';
import { useFavorites } from '../../src/favorites';
import { ErrorRow } from '../(tabs)/index';
import type { Product } from '../../src/types';

const WEIGHT_VARIANTS = [{ l: '500 g', m: 0.5 }, { l: '1 kg', m: 1 }, { l: '2 kg', m: 2 }];
const PIECE_VARIANTS = [{ l: '1 adet', m: 1 }];

export default function ProductDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const favs = useFavorites();
  const fav = favs.isFav(String(slug));

  const { data: p, loading, error, refetch } = useAsync<Product>(() => getProduct(String(slug)), [slug]);
  const [variant, setVariant] = useState(1);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.forest} size="large" /></View>;
  }
  if (error || !p) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ErrorRow message={error ?? 'Ürün bulunamadı'} onRetry={refetch} />
        <Pressable onPress={() => router.back()}><Text style={styles.backLink}>‹ Geri</Text></Pressable>
      </View>
    );
  }

  const variants = p.saleType === 'WEIGHT' ? WEIGHT_VARIANTS : PIECE_VARIANTS;
  const v = variants[variant] ?? variants[0];
  const unit = effectivePrice(p);
  const old = oldPrice(p);
  const pct = discountPct(p);
  const shownPrice = unit * v.m;
  const shownOld = old != null ? old * v.m : null;
  const lineTotal = shownPrice * count;
  const tags = productTags(p);
  const emoji = emojiFor(p.slug, p.category?.slug);

  const addToCart = () => {
    cart.add(toCartLine(p), v.m * count, note);
    toast(`${p.name} sepete eklendi`);
    router.push('/sepet');
  };

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Hero */}
        <LinearGradient colors={['#FFFFFF', colors.creamDark]} style={styles.hero}>
          <Text style={styles.heroEmoji}>{emoji}</Text>
          <View style={[styles.heroTop, { top: insets.top + 6 }]}>
            <Pressable style={styles.circ} onPress={() => router.back()}><Text style={styles.circTxt}>‹</Text></Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={styles.circ} onPress={() => toast('Paylaşım (demo)')}><Text style={styles.circTxt}>↗</Text></Pressable>
              <Pressable style={styles.circ} onPress={() => { favs.toggle(String(slug)); toast(fav ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi ♥'); }}>
                <Text style={[styles.circTxt, { color: fav ? colors.berry : colors.ink }]}>{fav ? '♥' : '♡'}</Text>
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {/* Bilgi tabakası */}
        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
            {tags.map((t) => <Pill key={t} kind={t} />)}
          </View>
          <Text style={styles.name}>{p.name}</Text>
          <Text style={styles.sub}>{(p.originRegion ?? 'Taze ürün')} · sabah toplandı · elle ayıklandı</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{tl(shownPrice)}</Text>
            {shownOld != null ? <Text style={styles.oldPrice}>{tlBare(shownOld)}₺</Text> : null}
            {pct != null ? (
              <View style={styles.save}><Text style={styles.saveTxt}>%{pct} indirim</Text></View>
            ) : null}
          </View>

          {/* Varyantlar */}
          <View style={styles.vrow}>
            {variants.map((vv, i) => {
              const sel = i === variant;
              return (
                <Pressable key={vv.l} style={[styles.vchip, sel && styles.vchipSel]} onPress={() => setVariant(i)}>
                  <Text style={[styles.vchipTxt, sel && { color: colors.white }]}>{vv.l}</Text>
                </Pressable>
              );
            })}
          </View>

          {p.description ? (
            <View style={styles.noteCard}><Text style={styles.noteTxt}>{p.description}</Text></View>
          ) : null}

          {/* Ürün notu — paketleyene iletilir (API items[].note) */}
          <View style={styles.noteInputCard}>
            <Text style={styles.noteLabel}>📝 Ürün notu <Text style={styles.noteOpt}>(opsiyonel)</Text></Text>
            <TextInput
              style={styles.noteInput}
              placeholder='Örn: "Çok sert olmasın, biraz olgun seçilsin"'
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={200}
            />
            <Text style={styles.noteHint}>Paketleyene iletilir; ürün seçiminde dikkate alınır.</Text>
          </View>

          {/* Bilgi ızgarası */}
          <View style={styles.infogrid}>
            <View style={styles.infobit}>
              <Text style={styles.infoL}>MENŞEİ</Text>
              <Text style={styles.infoV}>{p.originRegion ?? '—'}</Text>
            </View>
            <View style={styles.infobit}>
              <Text style={styles.infoL}>SATIŞ</Text>
              <Text style={styles.infoV}>{p.saleType === 'WEIGHT' ? 'Tartılı (kg)' : 'Adet'}</Text>
            </View>
          </View>

          {p.saleType === 'WEIGHT' ? (
            <View style={styles.noteCard}>
              <Text style={[styles.noteTxt, { fontSize: 11 }]}>⚖️ Tartılı üründe nihai tutar paketlemede gramaja göre küçük farklılık gösterebilir.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Satın alma çubuğu */}
      <View style={[styles.buybar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.step}>
          <Pressable onPress={() => setCount((c) => Math.max(1, c - 1))} hitSlop={8}><Text style={styles.stepBtn}>−</Text></Pressable>
          <Text style={styles.stepVal}>{count} {p.saleType === 'WEIGHT' ? `× ${v.l}` : 'adet'}</Text>
          <Pressable onPress={() => setCount((c) => c + 1)} hitSlop={8}><Text style={styles.stepBtn}>+</Text></Pressable>
        </View>
        <Pressable style={styles.addBig} onPress={addToCart}>
          <Text style={styles.addBigTxt}>Sepete ekle · {tl(lineTotal)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream, gap: 14 },
  backLink: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 14 },
  hero: { height: 300, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 128 },
  heroTop: {
    position: 'absolute', left: 0, right: 0, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  circ: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center', ...shadow.soft,
  },
  circTxt: { fontSize: 18, color: colors.ink },
  sheet: {
    backgroundColor: colors.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    marginTop: -26, paddingHorizontal: 18, paddingTop: 20,
  },
  name: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, marginTop: 6 },
  sub: { color: colors.muted, fontSize: 12.5, marginTop: 2, marginBottom: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 },
  price: { fontFamily: fonts.serif, fontSize: 26, color: colors.forest },
  oldPrice: { color: colors.muted, fontSize: 14, textDecorationLine: 'line-through' },
  save: { marginLeft: 'auto', backgroundColor: '#FBEEE6', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 },
  saveTxt: { color: colors.persimmonDark, fontSize: 11, fontFamily: fonts.bodyBold },
  vrow: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  vchip: {
    flex: 1, alignItems: 'center', borderRadius: radius.md, paddingVertical: 11,
    backgroundColor: colors.white, ...shadow.soft,
  },
  vchipSel: { backgroundColor: colors.forest },
  vchipTxt: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.muted },
  noteCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 12, ...shadow.soft },
  noteTxt: { fontSize: 11.5, color: colors.muted, lineHeight: 17 },
  noteInputCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 12, ...shadow.soft },
  noteLabel: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.ink, marginBottom: 8 },
  noteOpt: { fontFamily: fonts.body, color: colors.muted, fontSize: 11 },
  noteInput: {
    backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: fonts.body, fontSize: 13, color: colors.ink, minHeight: 44, textAlignVertical: 'top',
  },
  noteHint: { fontSize: 10.5, color: colors.muted, marginTop: 6 },
  infogrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  infobit: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 11, ...shadow.soft },
  infoL: { fontSize: 10, color: colors.muted, letterSpacing: 0.4 },
  infoV: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.ink, marginTop: 2 },
  buybar: {
    flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 18, paddingTop: 12,
    backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: colors.line,
  },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, ...shadow.soft,
  },
  stepBtn: { fontSize: 20, color: colors.forest, width: 18, textAlign: 'center' },
  stepVal: { fontSize: 12.5, fontFamily: fonts.bodySemi, color: colors.ink, minWidth: 56, textAlign: 'center' },
  addBig: {
    flex: 1, backgroundColor: colors.persimmon, borderRadius: radius.md, paddingVertical: 15,
    alignItems: 'center',
  },
  addBigTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 13.5 },
});
