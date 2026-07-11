import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow, CATEGORY_ICONS } from '../../src/theme';
import { getProducts, getCategories, getBaskets } from '../../src/api';
import { useAsync } from '../../src/hooks';
import { ProductCard } from '../../components/ProductCard';
import { SectionTitle } from '../../components/ui';
import { tlBare } from '../../src/format';
import { effectivePrice } from '../../src/product';
import { useCart } from '../../src/cart';
import type { Product, Category, Basket } from '../../src/types';

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cart = useCart();

  const products = useAsync<Product[]>(() => getProducts(), []);
  const categories = useAsync<Category[]>(() => getCategories(), []);
  const baskets = useAsync<Basket[]>(() => getBaskets().catch(() => []), []);

  const all = products.data ?? [];
  const fresh = all.filter((p) => p.isFreshDaily || p.freshToday);
  const local = all.filter((p) => p.isLocal);
  const featured = fresh.length ? fresh : all;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Başlık + konum */}
      <View style={styles.hbar}>
        <View style={styles.hrow}>
          <Text style={styles.wordmark}>Kabzı<Text style={{ color: colors.persimmon }}>Mall</Text></Text>
          <View style={styles.bell}><Text style={{ fontSize: 16 }}>🔔</Text></View>
        </View>
        <Text style={styles.loc}>📍 Teslimat · <Text style={styles.locB}>Moda, Kadıköy</Text> ▾</Text>
      </View>

      {/* Arama */}
      <Pressable style={styles.search} onPress={() => router.push('/kategori')}>
        <Text style={styles.searchTxt}>🔍  Domates, muz, zeytinyağı…</Text>
      </Pressable>

      {/* Promo */}
      <Pressable onPress={() => router.push('/kategori')}>
        <LinearGradient
          colors={[colors.forest, '#2B6347']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.promo}
        >
          <Text style={styles.promoK}>İLK SİPARİŞ</Text>
          <Text style={styles.promoT}>Dalından{'\n'}%10 indirim</Text>
          <Text style={styles.promoS}>Bugün sabah toplanan ürünlerde geçerli</Text>
          <Text style={styles.promoEmoji}>🍑</Text>
        </LinearGradient>
      </Pressable>

      {/* Kategoriler */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cats}
      >
        {(categories.data ?? []).map((c) => (
          <Pressable key={c.slug} style={styles.cat} onPress={() => router.push(`/kategori?c=${c.slug}`)}>
            <View style={styles.ring}><Text style={{ fontSize: 25 }}>{CATEGORY_ICONS[c.slug] ?? '🧺'}</Text></View>
            <Text style={styles.catName}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Bugün taze gelenler */}
      <SectionTitle title="Bugün taze gelenler" actionLabel="Tümü →" onAction={() => router.push('/kategori')} />
      {products.loading ? (
        <ActivityIndicator color={colors.forest} style={{ marginVertical: 24 }} />
      ) : products.error ? (
        <ErrorRow message={products.error} onRetry={products.refetch} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prow}>
          {featured.map((p) => (
            <ProductCard key={p.slug} product={p} style={{ width: 142 }} />
          ))}
        </ScrollView>
      )}

      {/* Hazır sepetler */}
      {(baskets.data ?? []).length > 0 && (
        <>
          <SectionTitle title="Hazır sepetler" />
          {(baskets.data ?? []).map((b) => (
            <BasketRow key={b.slug} basket={b} onAdd={() => {
              cart.add({
                slug: b.slug, name: b.name, emoji: '🧺', unitLabel: 'adet',
                saleType: 'PIECE', unitPrice: effectivePrice(b), isBasket: true,
              }, 1);
            }} />
          ))}
        </>
      )}

      {/* Yöresel seçkiler */}
      {local.length > 0 && (
        <>
          <SectionTitle title="Yöresel seçkiler" actionLabel="Tümü →" onAction={() => router.push('/kategori')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prow}>
            {local.map((p) => <ProductCard key={p.slug} product={p} style={{ width: 142 }} />)}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

function BasketRow({ basket, onAdd }: { basket: Basket; onAdd: () => void }) {
  return (
    <View style={styles.basket}>
      <View style={styles.basketIc}><Text style={{ fontSize: 23 }}>🧺</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.basketNm}>{basket.name}</Text>
        {basket.description ? <Text style={styles.basketMeta}>{basket.description}</Text> : null}
      </View>
      <Text style={styles.basketPr}>{tlBare(effectivePrice(basket))}₺</Text>
    </View>
  );
}

export function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Pressable onPress={onRetry} style={styles.errBox}>
      <Text style={styles.errTxt}>⚠️ {message}</Text>
      <Text style={styles.errRetry}>Yeniden dene</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  hbar: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 },
  hrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  bell: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', ...shadow.soft,
  },
  loc: { fontSize: 11, color: colors.muted, fontFamily: fonts.bodySemi, marginTop: 5 },
  locB: { color: colors.forest, fontFamily: fonts.bodyBold },
  search: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: 15, paddingVertical: 13, ...shadow.soft,
  },
  searchTxt: { color: colors.muted, fontSize: 13, fontFamily: fonts.body },
  promo: {
    marginHorizontal: 18, marginTop: 12, borderRadius: radius.xl, padding: 20, overflow: 'hidden',
  },
  promoK: { fontSize: 10.5, letterSpacing: 2, color: colors.honey, fontFamily: fonts.bodyBold },
  promoT: { fontFamily: fonts.serif, fontSize: 21, color: colors.white, marginTop: 5, lineHeight: 24 },
  promoS: { fontSize: 12, color: 'rgba(255,255,255,0.82)', marginTop: 4, maxWidth: 175 },
  promoEmoji: { position: 'absolute', right: -6, bottom: -18, fontSize: 92, transform: [{ rotate: '-8deg' }] },
  cats: { paddingHorizontal: 18, paddingTop: 16, gap: 13 },
  cat: { alignItems: 'center' },
  ring: {
    width: 56, height: 56, borderRadius: 19, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6, ...shadow.soft,
  },
  catName: { fontSize: 11, fontFamily: fonts.bodySemi, color: colors.ink },
  prow: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 6, gap: 13 },
  basket: {
    marginHorizontal: 18, marginTop: 8, backgroundColor: colors.white, borderWidth: 1,
    borderColor: colors.line, borderRadius: radius.xl, padding: 13, flexDirection: 'row',
    alignItems: 'center', gap: 12, ...shadow.soft,
  },
  basketIc: {
    width: 46, height: 46, borderRadius: radius.md, backgroundColor: '#F6E3BF',
    alignItems: 'center', justifyContent: 'center',
  },
  basketNm: { fontFamily: fonts.serif, fontSize: 14.5, color: colors.ink },
  basketMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  basketPr: { fontFamily: fonts.serif, fontSize: 15, color: colors.forest },
  errBox: { marginHorizontal: 18, marginVertical: 16, alignItems: 'center', gap: 6 },
  errTxt: { color: colors.berry, fontFamily: fonts.bodyMed, fontSize: 13, textAlign: 'center' },
  errRetry: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 13 },
});
