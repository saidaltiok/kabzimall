import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../src/theme';
import { getProducts } from '../src/api';
import { useAsync } from '../src/hooks';
import { useFavorites } from '../src/favorites';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../src/types';

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const favs = useFavorites();
  const products = useAsync<Product[]>(() => getProducts(), []);

  const favProducts = (products.data ?? []).filter((p) => favs.isFav(p.slug));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Favorilerim</Text>
        <View style={{ width: 20 }} />
      </View>

      {products.loading ? (
        <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
      ) : favProducts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>❤️</Text>
          <Text style={styles.emptyH}>Henüz favorin yok</Text>
          <Text style={styles.emptyS}>Beğendiğin ürünlerde kalbe dokun; burada toplansın.</Text>
          <Pressable style={styles.shopBtn} onPress={() => router.replace('/')}>
            <Text style={styles.shopBtnTxt}>Ürünleri keşfet</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridWrap}>
          <Text style={styles.count}>{favProducts.length} ürün</Text>
          <View style={styles.grid}>
            {favProducts.map((p) => (
              <View key={p.slug} style={styles.cell}>
                <ProductCard product={p} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  gridWrap: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  count: { color: colors.muted, fontSize: 12.5, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48%', marginBottom: 13 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30, gap: 6 },
  emptyH: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, marginTop: 8 },
  emptyS: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  shopBtn: { marginTop: 18, backgroundColor: colors.persimmon, borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 13 },
  shopBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
});
