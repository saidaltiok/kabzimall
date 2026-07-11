import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow } from '../../src/theme';
import { tl, orderTotal, orderSlotLabel } from '../../src/format';
import { getOrder, cancelOrder, rateOrder, reportIssue, ISSUE_REASONS } from '../../src/api';
import type { Order, OrderStatus } from '../../src/types';

const STEPS = ['Sipariş alındı', 'Hazırlanıyor', 'Hazırlandı', 'Yola çıktı', 'Teslim edildi'];
const STAGE: Record<OrderStatus, number> = {
  CONFIRMED: 1, PREPARING: 1, READY: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, CANCELLED: -1,
};
const CANCELLABLE: OrderStatus[] = ['CONFIRMED', 'PREPARING'];

export default function OrderTracking() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await getOrder(String(id));
      setOrder(o);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Sipariş bulunamadı');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // web ile aynı: 30 sn'de bir tazele
    return () => clearInterval(t);
  }, [load]);

  const doCancel = () => {
    Alert.alert('Siparişi iptal et', 'Bu siparişi iptal etmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et', style: 'destructive',
        onPress: async () => {
          try { const o = await cancelOrder(String(id)); setOrder(o); }
          catch (e: any) { Alert.alert('İptal edilemedi', e?.message ?? ''); }
        },
      },
    ]);
  };

  if (loading && !order) {
    return <View style={styles.center}><ActivityIndicator color={colors.forest} size="large" /></View>;
  }
  if (error && !order) {
    return (
      <View style={[styles.center, { gap: 12 }]}>
        <Text style={{ fontSize: 44 }}>📦</Text>
        <Text style={styles.errTxt}>{error}</Text>
        <Pressable onPress={() => router.replace('/')}><Text style={styles.link}>Ana sayfaya dön</Text></Pressable>
      </View>
    );
  }

  const o = order!;
  const stage = STAGE[o.status] ?? 1;
  const cancelled = o.status === 'CANCELLED';
  const delivered = o.status === 'DELIVERED';
  const slotLabel = orderSlotLabel(o);
  const itemCount = o.items?.length ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/siparisler')} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Sipariş takibi</Text>
        <View style={{ width: 20 }} />
      </View>

      {isNew ? (
        <View style={styles.successCard}>
          <Text style={{ fontSize: 44 }}>✅</Text>
          <Text style={styles.successH}>Siparişin alındı!</Text>
          <Text style={styles.successS}>Sipariş no <Text style={{ color: colors.ink, fontFamily: fonts.bodyBold }}>{o.code}</Text></Text>
        </View>
      ) : (
        <Text style={styles.metaLine}>No {o.code} · Tahmini {slotLabel}</Text>
      )}

      {/* Özet kartı */}
      <View style={styles.card}>
        <InfoRow label="Teslimat" value={slotLabel} />
        <InfoRow label="Ürün" value={`${itemCount} kalem`} />
        <InfoRow label="Toplam" value={tl(orderTotal(o))} />
        {o.paymentMethod ? <InfoRow label="Ödeme" value={o.paymentMethod === 'CASH' ? 'Kapıda nakit' : 'Kapıda kart'} /> : null}
      </View>

      {/* Durum çizelgesi */}
      {cancelled ? (
        <View style={[styles.card, { alignItems: 'center', gap: 6 }]}>
          <Text style={{ fontSize: 34 }}>🚫</Text>
          <Text style={styles.cancelH}>Sipariş iptal edildi</Text>
        </View>
      ) : (
        <View style={styles.track}>
          {STEPS.map((label, i) => {
            const done = delivered || i < stage;
            const cur = !delivered && i === stage;
            const last = i === STEPS.length - 1;
            return (
              <View key={label} style={styles.tstep}>
                <View style={styles.tcol}>
                  <View style={[styles.tdot, done && styles.tdotDone, cur && styles.tdotCur]}>
                    <Text style={styles.tdotTxt}>{done ? '✓' : cur ? '●' : ''}</Text>
                  </View>
                  {!last ? <View style={[styles.tline, done && { backgroundColor: colors.forest }]} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 22 }}>
                  <Text style={[styles.tname, !done && !cur && { color: colors.muted }]}>{label}</Text>
                  {cur ? <Text style={styles.tsub}>şu an</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Teslim sonrası: değerlendirme + sorun bildirimi */}
      {delivered ? (
        <>
          <RatingCard order={o} onRated={load} />
          <IssueCard order={o} />
        </>
      ) : (
        <View style={styles.noteCard}>
          <Text style={styles.noteTxt}>
            📦 Paketleme sırasında bir ürün stokta kalmazsa tercihine göre işlem yapılır (değiştir / ara / çıkar).
          </Text>
        </View>
      )}

      {CANCELLABLE.includes(o.status) ? (
        <Pressable style={styles.cancelBtn} onPress={doCancel}>
          <Text style={styles.cancelBtnTxt}>Siparişi iptal et</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.homeBtn} onPress={() => router.replace('/')}>
        <Text style={styles.homeBtnTxt}>Alışverişe devam et</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ------------------------------ Değerlendirme ------------------------------ */

function RatingCard({ order, onRated }: { order: Order; onRated: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  if (order.rating != null) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionH}>Değerlendirmen</Text>
        <Text style={styles.starsRow}>
          {'★'.repeat(order.rating)}<Text style={{ color: colors.line }}>{'★'.repeat(5 - order.rating)}</Text>
        </Text>
        {order.ratingComment ? <Text style={styles.ratingComment}>“{order.ratingComment}”</Text> : null}
        <Text style={styles.thanks}>Geri bildirimin için teşekkürler 🙏</Text>
      </View>
    );
  }

  const submit = async () => {
    if (stars < 1) return Alert.alert('Puan', 'Lütfen 1-5 arası bir puan seç.');
    setBusy(true);
    try {
      await rateOrder(order.id, stars, comment.trim() || undefined);
      onRated();
    } catch (e: any) {
      Alert.alert('Gönderilemedi', e?.message ?? '');
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionH}>Siparişini değerlendir</Text>
      <View style={styles.starPick}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
            <Text style={[styles.star, { color: n <= stars ? colors.honey : colors.line }]}>★</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.commentInput}
        placeholder="Yorumun (opsiyonel)"
        placeholderTextColor={colors.muted}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={300}
      />
      <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnTxt}>Gönder</Text>}
      </Pressable>
    </View>
  );
}

/* ------------------------------ Sorun bildirimi ------------------------------ */

function IssueCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const toggleItem = (itemId: string) =>
    setSel((cur) => (cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId]));

  const submit = async () => {
    if (sel.length === 0) return Alert.alert('Sorun', 'En az bir ürün seç.');
    if (!reason) return Alert.alert('Sorun', 'Bir sebep seç.');
    setBusy(true);
    try {
      const r = await reportIssue(order.id, sel, reason, message.trim() || undefined);
      setDone(true);
      const fallback = r.amount
        ? `Anında ${tl(r.amount)} telafi kuponu tanımlandı${r.couponCode ? ` (${r.couponCode})` : ''}. Bir sonraki siparişinde geçerli.`
        : 'Ekibimiz en kısa sürede seninle iletişime geçecek.';
      Alert.alert('Bildirimin alındı', r.message ?? fallback);
    } catch (e: any) {
      Alert.alert('Gönderilemedi', e?.message ?? '');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionH}>Sorun bildirimin alındı ✓</Text>
        <Text style={styles.noteTxt}>Gerekirse ekibimiz seninle iletişime geçecek.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.issueHead}>
        <Text style={styles.sectionH}>Bir sorun mu var?</Text>
        <Text style={styles.issueChevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? (
        <>
          <Text style={styles.issueLabel}>Etkilenen ürünler</Text>
          {(order.items ?? []).map((it) => {
            const on = sel.includes(it.id);
            return (
              <Pressable key={it.id} style={styles.issueItem} onPress={() => toggleItem(it.id)}>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                <Text style={styles.issueItemTxt}>{it.productName}</Text>
              </Pressable>
            );
          })}
          <Text style={styles.issueLabel}>Sebep</Text>
          <View style={styles.reasonRow}>
            {ISSUE_REASONS.map((r) => (
              <Pressable key={r.key} style={[styles.reasonChip, reason === r.key && styles.reasonChipSel]} onPress={() => setReason(r.key)}>
                <Text style={[styles.reasonTxt, reason === r.key && { color: colors.white }]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.commentInput}
            placeholder="Kısa açıklama (opsiyonel)"
            placeholderTextColor={colors.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={300}
          />
          <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnTxt}>Bildir</Text>}
          </Pressable>
        </>
      ) : (
        <Text style={styles.noteTxt}>Eksik, ezik ya da yanlış ürün geldiyse 24 saat içinde bildir; küçük tutarlarda anında telafi kuponu.</Text>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  errTxt: { color: colors.muted, fontFamily: fonts.bodyMed, fontSize: 14 },
  link: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 4 },
  back: { fontSize: 26, color: colors.ink, width: 20 },
  headerTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  successCard: { alignItems: 'center', paddingVertical: 18, gap: 4 },
  successH: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, marginTop: 6 },
  successS: { color: colors.muted, fontSize: 13 },
  metaLine: { color: colors.muted, fontSize: 12.5, paddingHorizontal: 18, marginTop: 6 },
  card: { marginHorizontal: 18, marginTop: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, ...shadow.soft },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  infoLabel: { color: colors.muted, fontSize: 13 },
  infoValue: { color: colors.ink, fontSize: 13, fontFamily: fonts.bodySemi },
  cancelH: { fontFamily: fonts.serif, fontSize: 16, color: colors.berry },
  track: { marginHorizontal: 18, marginTop: 14, paddingHorizontal: 4 },
  tstep: { flexDirection: 'row', gap: 14 },
  tcol: { alignItems: 'center', width: 28 },
  tdot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white,
    borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  tdotDone: { backgroundColor: colors.forest, borderColor: colors.forest },
  tdotCur: { backgroundColor: colors.persimmon, borderColor: colors.persimmon },
  tdotTxt: { color: colors.white, fontSize: 12 },
  tline: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 2, minHeight: 18 },
  tname: { fontSize: 13.5, fontFamily: fonts.bodySemi, color: colors.ink },
  tsub: { fontSize: 11, color: colors.persimmon, marginTop: 2, fontFamily: fonts.bodyMed },
  noteCard: { marginHorizontal: 18, marginTop: 6, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, ...shadow.soft },
  noteTxt: { fontSize: 11.5, color: colors.muted, lineHeight: 17 },
  // Değerlendirme
  sectionH: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink, marginBottom: 8 },
  starPick: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  star: { fontSize: 34 },
  starsRow: { fontSize: 22, color: colors.honey, letterSpacing: 2 },
  ratingComment: { fontSize: 12.5, color: colors.ink, fontStyle: 'italic', marginTop: 6 },
  thanks: { fontSize: 11.5, color: colors.muted, marginTop: 8 },
  commentInput: {
    backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: fonts.body, fontSize: 13, color: colors.ink, minHeight: 44, textAlignVertical: 'top', marginBottom: 10,
  },
  primaryBtn: { backgroundColor: colors.persimmon, borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center' },
  primaryBtnTxt: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  // Sorun
  issueHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  issueChevron: { color: colors.muted, fontSize: 15 },
  issueLabel: { fontSize: 11.5, color: colors.muted, marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  issueItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  checkMark: { color: colors.white, fontSize: 12, fontFamily: fonts.bodyBold },
  issueItemTxt: { fontSize: 13, color: colors.ink },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  reasonChip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  reasonChipSel: { backgroundColor: colors.forest, borderColor: colors.forest },
  reasonTxt: { fontSize: 12, fontFamily: fonts.bodySemi, color: colors.ink },
  cancelBtn: { marginHorizontal: 18, marginTop: 14, borderWidth: 1.5, borderColor: colors.berry, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  cancelBtnTxt: { color: colors.berry, fontFamily: fonts.bodyBold, fontSize: 14 },
  homeBtn: { marginHorizontal: 18, marginTop: 10, alignItems: 'center', paddingVertical: 12 },
  homeBtnTxt: { color: colors.persimmon, fontFamily: fonts.bodyBold, fontSize: 14 },
});
