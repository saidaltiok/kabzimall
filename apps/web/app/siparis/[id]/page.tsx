'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { tl, emojiFor } from '@/lib/format';
import { useCart } from '@/lib/cart';
import OrderTimeline from '@/components/OrderTimeline';
import Modal from '@/components/Modal';

interface OrderItem { id: string; productName: string; orderedQty: number; pickedQty: number | null; unitLabel: string | null; lineTotal: number; note: string | null; product: { slug: string } | null }
interface StoreProduct {
  slug: string; name: string; unitLabel: string | null; stockQty: number | null; maxPerOrder: number | null;
  basePrice: number; discountedPrice: number | null; category: { slug: string } | null;
}
interface Order {
  id: string; code: string; status: string; customerName: string; addressText: string;
  deliveryDate: string | null; deliveryWindow: string | null;
  slotChangeDate: string | null; slotChangeWindow: string | null; slotChangeStatus: string | null;
  subtotal: number; couponCode: string | null; discountTotal: number; deliveryFee: number; grandTotal: number; finalTotal: number | null;
  rating: number | null; items: OrderItem[];
  refunds?: { id: string; amount: number; method: string; couponCode: string | null; createdAt: string }[];
  notifications: { id: string; message: string; createdAt: string }[];
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[];
}

const STATUS: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};

const CANCELLABLE = ['CONFIRMED', 'PREPARING'];

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { add } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);
  // Teslimat saati değişikliği (yalnız CONFIRMED'da; admin onayıyla kesinleşir).
  const [slotOpen, setSlotOpen] = useState(false);
  const [slots, setSlots] = useState<{ date: string; window: string; label: string }[]>([]);
  const [slotKey, setSlotKey] = useState('');
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotErr, setSlotErr] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null); // canlı yardım (Ayarlar'dan)
  // Teslim sonrası: puanlama + sorun bildirimi (E1/E2)
  const [stars, setStars] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingDone, setRatingDone] = useState<number | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueItems, setIssueItems] = useState<Set<string>>(new Set());
  const [issueReason, setIssueReason] = useState('EZIK_CURUK');
  const [issueMsg, setIssueMsg] = useState('');
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueResult, setIssueResult] = useState<string | null>(null);
  const [issueErr, setIssueErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = () =>
      apiGet<Order>(`/storefront/orders/${params.id}`)
        .then((o) => {
          if (!active) return;
          setOrder(o);
          // Sipariş kapandıysa (teslim/iptal) tazelemeyi durdur — durum artık değişmez.
          if (timer && (o.status === 'DELIVERED' || o.status === 'CANCELLED')) {
            clearInterval(timer);
            timer = null;
          }
        })
        .catch((e) => { if (active) setError(e.message); });
    load();
    // Aktif siparişte 30 sn'de bir kendini tazele — "Yolda"ya geçtiğini müşteri görsün.
    timer = setInterval(load, 30_000);
    // Canlı yardım: mağazanın WhatsApp'ı (yoksa buton görünmez).
    apiGet<{ contactWhatsapp: string | null }>('/storefront/settings')
      .then((s) => { if (active) setWhatsapp(s.contactWhatsapp); })
      .catch(() => {});
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [params.id]);

  async function cancelOrder() {
    if (!window.confirm('Siparişini iptal etmek istediğine emin misin?')) return;
    setCancelling(true);
    setCancelErr(null);
    try {
      const updated = await apiPost<Order>(`/storefront/orders/${params.id}/cancel`, {});
      setOrder(updated);
    } catch (e) {
      setCancelErr((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  async function openSlotChange() {
    setSlotErr(null);
    setSlotOpen(true);
    if (slots.length === 0) {
      try {
        const r = await apiGet<{ data: { date: string; window: string; label: string }[] }>('/storefront/slots');
        // Mevcut slotu listeden çıkar — "değişiklik" ancak farklı bir saate olabilir.
        setSlots(r.data.filter((s) => !(s.date === order?.deliveryDate?.slice(0, 10) && s.window === order?.deliveryWindow)));
      } catch (e) {
        setSlotErr((e as Error).message);
      }
    }
  }

  async function submitSlotChange() {
    const s = slots.find((x) => `${x.date}|${x.window}` === slotKey);
    if (!s) return;
    setSlotBusy(true);
    setSlotErr(null);
    try {
      const updated = await apiPost<Order>(`/storefront/orders/${params.id}/slot-change`, { date: s.date, window: s.window });
      setOrder(updated);
      setSlotOpen(false);
      setSlotKey('');
    } catch (e) {
      setSlotErr((e as Error).message);
    } finally {
      setSlotBusy(false);
    }
  }

  /** Geçmiş siparişteki ürünleri güncel fiyat/stokla sepete ekler. */
  async function reorder() {
    if (!order) return;
    setReordering(true);
    setReorderMsg(null);
    const slugs = [...new Set(order.items.map((i) => i.product?.slug).filter(Boolean))] as string[];
    let added = 0;
    let skipped = 0;
    await Promise.all(
      slugs.map(async (slug) => {
        try {
          const p = await apiGet<StoreProduct>(`/storefront/products/${slug}`);
          const soldOut = p.stockQty != null && p.stockQty <= 0;
          if (soldOut) { skipped++; return; }
          const it = order.items.find((x) => x.product?.slug === slug)!;
          const eff = p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.basePrice ? p.discountedPrice : p.basePrice;
          let qty = it.orderedQty;
          if (p.maxPerOrder != null && qty > p.maxPerOrder) qty = p.maxPerOrder;
          if (p.stockQty != null && qty > p.stockQty) qty = p.stockQty;
          add({ slug: p.slug, name: p.name, unitPrice: eff, unitLabel: p.unitLabel, emoji: emojiFor(p.slug, p.category?.slug), maxPerOrder: p.maxPerOrder ?? undefined }, qty);
          added++;
        } catch {
          skipped++;
        }
      }),
    );
    setReordering(false);
    if (added === 0) { setReorderMsg('Bu siparişteki ürünler şu an satışta değil.'); return; }
    router.push('/sepet');
  }

  async function sendRating() {
    if (!order || stars < 1) return;
    setRatingBusy(true);
    try {
      await apiPost(`/storefront/orders/${order.id}/rating`, { rating: stars, comment: ratingComment.trim() || undefined });
      setRatingDone(stars);
    } catch (e) {
      setIssueErr((e as Error).message);
    } finally {
      setRatingBusy(false);
    }
  }

  async function sendIssue() {
    if (!order || issueItems.size === 0) return;
    setIssueBusy(true); setIssueErr(null);
    try {
      const r = await apiPost<{ resolved: boolean; message: string }>(`/storefront/orders/${order.id}/issue`, {
        itemIds: [...issueItems], reason: issueReason, message: issueMsg.trim() || undefined,
      });
      setIssueResult(r.message);
      setIssueOpen(false);
    } catch (e) {
      setIssueErr((e as Error).message);
    } finally {
      setIssueBusy(false);
    }
  }

  if (error) return <div className="error" style={{ marginTop: 24 }}>Sipariş bulunamadı: {error}</div>;
  if (!order) return <div className="loading">Yükleniyor…</div>;

  return (
    <div style={{ padding: '30px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <h1 className="serif" style={{ fontSize: 26, margin: '10px 0 4px' }}>Siparişin alındı!</h1>
        <div className="muted">Sipariş no <b style={{ color: 'var(--ink)' }}>{order.code}</b> · {STATUS[order.status] ?? order.status}</div>
      </div>

      <div className="success-card">
        {order.items.map((it) => (
          <div className="ln" key={it.id} style={{ alignItems: 'flex-start' }}>
            <span>
              {it.productName}{' '}
              {it.pickedQty != null && it.pickedQty !== it.orderedQty ? (
                <span className="muted">· <s>{it.orderedQty}</s> <b style={{ color: 'var(--forest)' }}>⚖️ {it.pickedQty} {it.unitLabel ?? ''}</b> tartıldı</span>
              ) : (
                <span className="muted">· {it.orderedQty} {it.unitLabel ?? ''}{it.pickedQty != null ? ' ⚖️' : ''}</span>
              )}
              {it.note && <span className="muted" style={{ display: 'block', fontSize: 12, fontStyle: 'italic' }}>📝 {it.note}</span>}
            </span>
            <b>{tl(it.lineTotal)}</b>
          </div>
        ))}
        <div className="ln" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 6 }}>
          <span className="muted">Ara toplam</span><span>{tl(order.subtotal)}</span>
        </div>
        {order.discountTotal > 0 && (
          <div className="ln"><span className="muted">Kupon {order.couponCode}</span><span style={{ color: 'var(--forest)' }}>−{tl(order.discountTotal)}</span></div>
        )}
        <div className="ln"><span className="muted">Teslimat</span><span>{order.deliveryFee === 0 ? 'Ücretsiz' : tl(order.deliveryFee)}</span></div>
        <div className="ln serif" style={{ fontSize: 18, fontWeight: 600 }}>
          <span>{order.finalTotal != null ? 'Tahmini toplam' : 'Toplam (kapıda ödeme)'}</span><span>{tl(order.grandTotal)}</span>
        </div>
        {order.finalTotal != null && (
          <div className="ln serif" style={{ fontSize: 18, fontWeight: 700, color: 'var(--forest)' }}>
            <span>💵 Kapıda ödenecek (tartı sonrası kesin)</span><span>{tl(order.finalTotal)}</span>
          </div>
        )}
        {(order.refunds?.length ?? 0) > 0 && order.refunds!.map((r) => (
          <div className="ln" key={r.id} style={{ color: 'var(--berry, #b23)' }}>
            <span>↩ İade edildi ({r.method === 'CASH' ? 'nakit' : `kupon: ${r.couponCode} — sonraki siparişinde geçerli`})</span>
            <b>−{tl(r.amount)}</b>
          </div>
        ))}
        {order.deliveryWindow && (
          <div className="ln" style={{ marginTop: 6 }}>
            <span className="muted">Teslimat saati</span>
            <b>{order.deliveryDate?.slice(0, 10)} · {order.deliveryWindow}</b>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Teslimat: <b>{order.customerName}</b> · {order.addressText}. Tartılı ürünlerde nihai tutar
          paketlemede gramajla kesinleşir.
        </p>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 6 }}>
          {reorderMsg && <div className="error" style={{ marginBottom: 8 }}>{reorderMsg}</div>}
          <button className="cta" style={{ marginTop: 0 }} onClick={reorder} disabled={reordering}>
            {reordering ? 'Sepete ekleniyor…' : '🔁 Aynısını tekrar sipariş ver'}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Ürünler güncel fiyat ve stok durumuyla sepete eklenir.</p>
        </div>
      </div>

      <div className="success-card" style={{ marginTop: 16 }}>
        <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 16 }}>Sipariş durumu</h3>
        <OrderTimeline status={order.status} />
        {order.statusHistory?.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            {order.statusHistory.map((s) => (
              <div key={s.id} className="ln" style={{ alignItems: 'flex-start', fontSize: 13 }}>
                <span>{STATUS[s.toStatus] ?? s.toStatus}{s.note ? ` · ${s.note}` : ''}</span>
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(s.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
        {order.status === 'CONFIRMED' && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            {order.slotChangeStatus === 'PENDING' ? (
              <div style={{ fontSize: 13 }}>
                🕒 <b>Saat değişikliği talebin onay bekliyor:</b> {order.slotChangeDate?.slice(0, 10)} · {order.slotChangeWindow}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Mağaza onaylayınca teslimat saatin güncellenir ve bilgilendirilirsin.</div>
              </div>
            ) : !slotOpen ? (
              <>
                <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }} onClick={openSlotChange}>
                  🕒 Teslimat saatini değiştir
                </button>
                <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Hazırlanmaya başlamadan önce değiştirebilirsin.</span>
              </>
            ) : (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Yeni teslimat saati seç</div>
                {slotErr && <div className="error" style={{ marginBottom: 8 }}>{slotErr}</div>}
                {slots.map((s) => {
                  const key = `${s.date}|${s.window}`;
                  return (
                    <div key={key} className={`choice ${slotKey === key ? 'sel' : ''}`} style={{ marginBottom: 6, cursor: 'pointer' }} onClick={() => setSlotKey(key)}>
                      <span>{s.label}</span><span>{slotKey === key ? '✓' : ''}</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
                  <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} onClick={submitSlotChange} disabled={slotBusy || !slotKey}>
                    {slotBusy ? 'Gönderiliyor…' : 'Talebi gönder'}
                  </button>
                  <button className="rm" onClick={() => { setSlotOpen(false); setSlotKey(''); }}>Vazgeç</button>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Talebin mağaza onayına gider; onaylanınca yeni saat kesinleşir.</p>
              </div>
            )}
          </div>
        )}
        {CANCELLABLE.includes(order.status) && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            {cancelErr && <div className="error" style={{ marginBottom: 8 }}>{cancelErr}</div>}
            <button className="rm" onClick={cancelOrder} disabled={cancelling}>
              {cancelling ? 'İptal ediliyor…' : 'Siparişi iptal et'}
            </button>
            <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Hazırlanmaya başlamadan önce iptal edebilirsin.</span>
          </div>
        )}
      </div>

      {/* Teslim sonrası: puanlama + sorun bildirimi */}
      {order.status === 'DELIVERED' && (
        <div className="success-card" style={{ marginTop: 16, textAlign: 'center' }}>
          {issueResult && <div className="ok-note" style={{ background: '#eaf3ea', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>✅ {issueResult}</div>}
          {(ratingDone ?? order.rating) != null ? (
            <div style={{ fontSize: 14 }}>
              Değerlendirmen: <span style={{ color: 'var(--honey)', fontSize: 18 }}>{'★'.repeat(ratingDone ?? order.rating!)}{'☆'.repeat(5 - (ratingDone ?? order.rating!))}</span>
              <span className="muted"> — teşekkürler!</span>
            </div>
          ) : (
            <>
              <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 16 }}>Siparişin nasıldı?</h3>
              <div style={{ fontSize: 30, letterSpacing: 4, cursor: 'pointer', userSelect: 'none' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} onClick={() => setStars(n)} style={{ color: n <= stars ? 'var(--honey)' : 'var(--line)' }}>★</span>
                ))}
              </div>
              {stars > 0 && (
                <div style={{ maxWidth: 380, margin: '8px auto 0' }}>
                  <input className="search" style={{ width: '100%' }} placeholder="İstersen bir yorum bırak (opsiyonel)" value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} maxLength={500} />
                  <button className="cta" style={{ marginTop: 8, width: 'auto', padding: '9px 20px' }} disabled={ratingBusy} onClick={sendRating}>
                    {ratingBusy ? 'Gönderiliyor…' : 'Puanı gönder'}
                  </button>
                </div>
              )}
            </>
          )}
          {!issueResult && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5 }} onClick={() => setIssueOpen(true)}>
                🛠 Üründe sorun mu vardı? Bildir, telafi edelim
              </button>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Teslimattan sonraki 24 saat içinde; küçük tutarlar anında kuponla telafi edilir.</div>
            </div>
          )}
          {issueErr && <div className="error" style={{ marginTop: 10 }}>{issueErr}</div>}
        </div>
      )}

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Ürün sorunu bildir" footer={
        <>
          <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '8px 12px' }} onClick={() => setIssueOpen(false)}>Vazgeç</button>
          <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} disabled={issueBusy || issueItems.size === 0} onClick={sendIssue}>
            {issueBusy ? 'Gönderiliyor…' : 'Bildir'}
          </button>
        </>
      }>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <b style={{ fontSize: 13.5 }}>Hangi ürün(ler)?</b>
            {order.items.map((it) => (
              <label key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={issueItems.has(it.id)} onChange={() => setIssueItems((s) => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n; })} />
                {it.productName} <span className="muted">({tl(it.lineTotal)})</span>
              </label>
            ))}
          </div>
          <div>
            <b style={{ fontSize: 13.5 }}>Sorun ne?</b>
            <select value={issueReason} onChange={(e) => setIssueReason(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 10, border: '1px solid var(--line)' }}>
              <option value="EZIK_CURUK">Ezik / çürük ürün</option>
              <option value="EKSIK">Eksik ürün</option>
              <option value="YANLIS_URUN">Yanlış ürün</option>
              <option value="DIGER">Diğer</option>
            </select>
          </div>
          <textarea rows={3} placeholder="Kısaca anlat (opsiyonel)" value={issueMsg} onChange={(e) => setIssueMsg(e.target.value)} maxLength={500} style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
          {issueErr && <div className="error">{issueErr}</div>}
        </div>
      </Modal>

      {order.notifications.length > 0 && (
        <div className="success-card" style={{ marginTop: 16 }}>
          <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 16 }}>Bildirimler</h3>
          {order.notifications.map((n) => (
            <div key={n.id} className="ln" style={{ alignItems: 'flex-start' }}>
              <span>🔔 {n.message}</span>
              <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(n.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canlı yardım — sipariş koduyla önceden yazılmış WhatsApp mesajı; yoksa destek formu */}
      <div className="success-card" style={{ marginTop: 16, textAlign: 'center' }}>
        <h3 className="serif" style={{ margin: '0 0 6px', fontSize: 16 }}>Bir sorun mu var?</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>Siparişinle ilgili anında yardım için bize yaz — sipariş kodun mesaja otomatik eklenir.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {whatsapp && (
            <a
              className="cta"
              style={{ marginTop: 0, width: 'auto', padding: '10px 18px', background: '#25D366', textDecoration: 'none' }}
              target="_blank" rel="noreferrer"
              href={`https://wa.me/${whatsapp.replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(`Merhaba, ${order.code} numaralı siparişim hakkında yardım almak istiyorum.`)}`}
            >
              💬 WhatsApp canlı yardım
            </a>
          )}
          <Link className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 18px', textDecoration: 'none' }} href={`/iletisim?siparis=${order.code}`}>
            ✉️ Destek talebi oluştur
          </Link>
        </div>
      </div>

      <p style={{ textAlign: 'center', marginTop: 22 }}>
        <Link href="/siparislerim" className="back">Siparişlerim</Link>　·
        <Link href="/" className="back">Alışverişe devam et →</Link>
      </p>
    </div>
  );
}
