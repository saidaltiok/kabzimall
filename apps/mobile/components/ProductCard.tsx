import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, radius, shadow } from '../src/theme';
import { emojiFor, tlBare } from '../src/format';
import { effectivePrice, oldPrice, toCartLine } from '../src/product';
import { useCart, stepSize } from '../src/cart';
import { useFavorites } from '../src/favorites';
import { Pill, productTags, useToast } from './ui';
import type { Product } from '../src/types';

/** Sepetteki miktarı kartın diline göre yaz (tartılı: "1,5 kg", adetli: "2"). */
function qtyShort(qty: number, saleType: Product['saleType'], unitLabel: string): string {
  return saleType === 'WEIGHT' ? `${qty.toLocaleString('tr-TR')} ${unitLabel}` : String(qty);
}

export function ProductCard({ product, style }: { product: Product; style?: ViewStyle }) {
  const router = useRouter();
  const cart = useCart();
  const favs = useFavorites();
  const toast = useToast();
  const emoji = emojiFor(product.slug, product.category?.slug);
  const price = effectivePrice(product);
  const old = oldPrice(product);
  const tags = productTags(product);
  const fav = favs.isFav(product.slug);

  const line = cart.lines.find((l) => l.slug === product.slug);
  const qty = line?.qty ?? 0;

  const quickAdd = () => {
    cart.add(toCartLine(product), stepSize(product.saleType));
    toast(`${product.name} sepete eklendi`);
  };

  return (
    <Pressable
      style={[styles.card, style]}
      onPress={() => router.push(`/urun/${product.slug}`)}
    >
      <View style={styles.ph}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      {tags[0] ? <View style={styles.badge}><Pill kind={tags[0]} /></View> : null}

      {/* Favori kalp — görselin sağ üst köşesi */}
      <Pressable
        style={styles.fav}
        hitSlop={8}
        onPress={() => { favs.toggle(product.slug); toast(fav ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi ♥'); }}
      >
        <Text style={[styles.favTxt, { color: fav ? colors.berry : colors.muted }]}>{fav ? '♥' : '♡'}</Text>
      </Pressable>

      {/* Sepet: yoksa + , varsa −/miktar/+ adım kutusu */}
      {qty > 0 ? (
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} hitSlop={6} onPress={() => cart.step(product.slug, -1)}>
            <Text style={styles.stepBtnTxt}>−</Text>
          </Pressable>
          <Text style={styles.stepQty} numberOfLines={1}>{qtyShort(qty, product.saleType, product.unitLabel)}</Text>
          <Pressable style={styles.stepBtn} hitSlop={6} onPress={() => cart.step(product.slug, 1)}>
            <Text style={styles.stepBtnTxt}>+</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.add} hitSlop={8} onPress={quickAdd}>
          <Text style={styles.addTxt}>+</Text>
        </Pressable>
      )}

      <Text style={styles.nm} numberOfLines={1}>{product.name}</Text>
      <Text style={styles.or} numberOfLines={1}>{product.originRegion ?? 'Taze ürün'}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.pr}>{tlBare(price)}₺</Text>
        {old ? <Text style={styles.old}>{tlBare(old)}</Text> : null}
      </View>
      <Text style={styles.unit}>/ {product.unitLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl, padding: 10,
    position: 'relative', ...shadow.soft,
  },
  ph: {
    height: 92, borderRadius: radius.md, backgroundColor: colors.creamDark,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 46 },
  badge: { position: 'absolute', top: 16, left: 16 },
  fav: {
    position: 'absolute', top: 15, right: 15, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center',
    ...shadow.soft,
  },
  favTxt: { fontSize: 15, lineHeight: 18 },
  add: {
    position: 'absolute', right: 15, top: 80, width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center',
    ...shadow.soft,
  },
  addTxt: { color: colors.white, fontSize: 20, lineHeight: 22, fontFamily: fonts.bodyMed },
  stepper: {
    position: 'absolute', right: 12, top: 78, height: 34, borderRadius: radius.sm,
    backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 2, ...shadow.soft,
  },
  stepBtn: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepBtnTxt: { color: colors.white, fontSize: 18, lineHeight: 20, fontFamily: fonts.bodyMed },
  stepQty: { color: colors.white, fontSize: 12, fontFamily: fonts.bodyBold, minWidth: 30, textAlign: 'center' },
  nm: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.ink, marginTop: 11 },
  or: { fontSize: 10.5, color: colors.muted, marginBottom: 5, marginTop: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  pr: { fontFamily: fonts.serif, fontSize: 15, color: colors.forest },
  old: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, textDecorationLine: 'line-through' },
  unit: { fontSize: 10, color: colors.muted, marginTop: 1 },
});
