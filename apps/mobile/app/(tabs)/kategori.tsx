import React, { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, shadow, CATEGORY_ICONS } from '../../src/theme';
import { getProducts, getCategories } from '../../src/api';
import { useAsync } from '../../src/hooks';
import { ProductCard } from '../../components/ProductCard';
import { ErrorRow } from './index';
import type { Product, Category } from '../../src/types';

export default function Catalog() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ c?: string }>();
  const [filter, setFilter] = useState<string>(params.c ?? 'all');
  const [query, setQuery] = useState('');

  const products = useAsync<Product[]>(() => getProducts(), []);
  const categories = useAsync<Category[]>(() => getCategories(), []);

  const list = useMemo(() => {
    let out = products.data ?? [];
    if (filter !== 'all') out = out.filter((p) => p.category?.slug === filter);
    if (query.trim()) {
      const q = query.trim().toLocaleLowerCase('tr');
      out = out.filter((p) => p.name.toLocaleLowerCase('tr').includes(q));
    }
    return out;
  }, [products.data, filter, query]);

  const chips = [{ slug: 'all', name: 'Tümü', icon: '🛒' }, ...(categories.data ?? []).map((c) => ({
    slug: c.slug, name: c.name, icon: CATEGORY_ICONS[c.slug] ?? '🧺',
  }))];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <Text style={styles.title}>Kategoriler</Text>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="🔍  Ürün ara…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {chips.map((c) => {
          const sel = filter === c.slug;
          return (
            <Pressable key={c.slug} style={styles.cat} onPress={() => setFilter(c.slug)}>
              {sel ? (
                <LinearGradient colors={[colors.persimmon, '#F3935F']} style={styles.ring}>
                  <Text style={{ fontSize: 24 }}>{c.icon}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.ring}><Text style={{ fontSize: 24 }}>{c.icon}</Text></View>
              )}
              <Text style={[styles.catName, sel && { color: colors.persimmon }]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {products.loading ? (
        <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
      ) : products.error ? (
        <ErrorRow message={products.error} onRetry={products.refetch} />
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>🧺</Text>
          <Text style={styles.emptyTxt}>Bu filtrede ürün yok</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridWrap}>
          <View style={styles.grid}>
            {list.map((p) => (
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
  title: { fontFamily: fonts.serif, fontSize: 21, color: colors.ink, paddingHorizontal: 18, paddingTop: 8 },
  searchWrap: { paddingHorizontal: 18, paddingTop: 10 },
  search: {
    backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 15, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 13, color: colors.ink, ...shadow.soft,
  },
  cats: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, gap: 13 },
  cat: { alignItems: 'center' },
  ring: {
    width: 56, height: 56, borderRadius: 19, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6, ...shadow.soft,
  },
  catName: { fontSize: 11, fontFamily: fonts.bodySemi, color: colors.ink },
  gridWrap: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48%', marginBottom: 13 },
  empty: { alignItems: 'center', marginTop: 50, gap: 10 },
  emptyTxt: { color: colors.muted, fontFamily: fonts.bodyMed, fontSize: 14 },
});
