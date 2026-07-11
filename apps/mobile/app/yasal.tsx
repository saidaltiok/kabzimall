import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../src/theme';

const DOCS: { title: string; body: string }[] = [
  {
    title: 'KVKK Aydınlatma Metni',
    body: 'KabzıMall, siparişini hazırlayıp teslim edebilmek için ad, telefon, teslimat adresi ve konum bilgini işler. Bu veriler yalnız siparişin işlenmesi, teslimatı ve yasal yükümlülükler için kullanılır; pazarlama izni ayrıca sorulur. Verilerine erişme, düzeltme ve silinmesini talep etme hakkın vardır. Talepler için iletişim kanallarını kullanabilirsin.',
  },
  {
    title: 'Gizlilik Politikası',
    body: 'Bilgilerin üçüncü taraflarla satış amacıyla paylaşılmaz; yalnız teslimatı gerçekleştiren kurye/operasyon ekibiyle ve yasal zorunluluk hâlinde yetkili mercilerle paylaşılır. E-posta ile giriş kodun geçici ve tek kullanımlıktır. Cihazındaki sepet ve favoriler yalnız telefonunda tutulur.',
  },
  {
    title: 'Mesafeli Satış Sözleşmesi',
    body: 'Siparişini onayladığında, seçtiğin ürünlerin belirtilen teslimat penceresinde adresine teslimin için sözleşme kurulur. Ödeme kapıda (nakit veya kart) alınır. Tartılı ürünlerde nihai tutar paketlemedeki gerçek gramaja göre kesinleşir. Satıcı kimlik bilgileri lansmanda bu ekrana eklenecektir.',
  },
  {
    title: 'İade & Cayma',
    body: 'Gıda ürünlerinde (çabuk bozulan meyve-sebze) niteliği gereği cayma hakkı sınırlıdır. Ancak eksik, ezik/çürük ya da yanlış gelen ürünleri teslimden sonra 24 saat içinde uygulamadan bildirebilirsin; uygun durumda anında telafi kuponu tanımlanır veya bedeli iade edilir.',
  },
];

export default function Legal() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Yasal metinler</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        {DOCS.map((d, i) => {
          const isOpen = open === i;
          return (
            <View key={i} style={styles.card}>
              <Pressable style={styles.row} onPress={() => setOpen(isOpen ? null : i)}>
                <Text style={styles.title}>{d.title}</Text>
                <Text style={styles.chevron}>{isOpen ? '▾' : '▸'}</Text>
              </Pressable>
              {isOpen ? <Text style={styles.body}>{d.body}</Text> : null}
            </View>
          );
        })}
        <Text style={styles.note}>
          Bu özetler bilgilendirme amaçlıdır. Şirket kimlik bilgileri ve nihai sözleşme metinleri lansmanda eklenecektir.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  card: { marginHorizontal: 18, marginTop: 10, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  chevron: { color: colors.muted, fontSize: 14 },
  body: { color: colors.muted, fontSize: 12.5, lineHeight: 19, marginTop: 10 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 18, paddingHorizontal: 24, lineHeight: 16 },
});
