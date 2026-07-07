'use client';

import { useState } from 'react';
import { tl, dt } from '@/lib/format';

export interface DetailItem {
  id: string; productName: string; orderedQty: number; pickedQty: number | null;
  unitLabel: string | null; lineTotal: number; note: string | null;
  product?: { stockQty: number | null; substitutes: { substitute: { name: string; stockQty: number | null; isActive: boolean } }[] } | null;
}
export interface DetailOrder {
  id: string; code: string; customerName: string; customerPhone: string; customerEmail?: string | null;
  addressText?: string | null; lat: number | null; lng: number | null;
  status: string; substitutionPref: string;
  subtotal?: number; deliveryFee?: number; discountTotal?: number; couponCode?: string | null;
  grandTotal: number; estimatedTotal?: number; finalTotal: number | null;
  deliveryDate: string | null; deliveryWindow: string | null;
  slotChangeStatus: string | null; slotChangeDate: string | null; slotChangeWindow: string | null;
  note: string | null; items: DetailItem[];
  rating?: number | null; ratingComment?: string | null;
  notifications?: { id: string; message: string; createdAt: string }[];
  statusHistory?: { id: string; fromStatus: string | null; toStatus: string; changedBy: string | null; note: string | null; createdAt: string }[];
}

const STATUS_TR: Record<string, string> = {
  CONFIRMED: 'Onaylandı', PREPARING: 'Hazırlanıyor', READY: 'Hazır',
  OUT_FOR_DELIVERY: 'Yolda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal',
};
const SUB_LABEL: Record<string, string> = {
  CALL: '📞 Eksikte: müşteriyi ara', REMOVE: '➖ Eksikte: ürünü çıkar', SUBSTITUTE: '🔄 Eksikte: benzeriyle değiştir',
};

/** Sipariş detayının okunur görünümü (pano pop-up'ı + gerektiğinde başka yerler). */
export default function OrderDetail({ order: o, onSlotDecide, onAddNote, busy }: {
  order: DetailOrder;
  onSlotDecide?: (approve: boolean) => void;
  /** Dahili personel notu ekleme (📌 — zaman çizelgesine düşer, müşteri görmez). */
  onAddNote?: (note: string) => void;
  busy?: boolean;
}) {
  const [noteText, setNoteText] = useState('');
  return (
    <div style={{ fontSize: 13.5 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span className="tagp info">{STATUS_TR[o.status] ?? o.status}</span>
        <b>{o.customerName}</b>
        <a href={`tel:${o.customerPhone}`} className="muted" style={{ color: 'inherit' }}>{o.customerPhone}</a>
        {o.customerEmail && <span className="muted">· {o.customerEmail}</span>}
        {o.rating != null && (
          <span className={`tagp ${o.rating <= 2 ? 'zararina' : 'info'}`} title={o.ratingComment ?? undefined}>
            {'★'.repeat(o.rating)}{'☆'.repeat(5 - o.rating)} {o.rating}/5{o.ratingComment ? ' 💬' : ''}
          </span>
        )}
      </div>
      {o.rating != null && o.ratingComment && (
        <div className="muted" style={{ marginBottom: 8, fontSize: 12, fontStyle: 'italic' }}>💬 “{o.ratingComment}”</div>
      )}

      <div style={{ marginBottom: 8 }}>
        <b>Adres:</b> {o.addressText ?? '—'}
        {o.lat != null && o.lng != null ? (
          <> · 📍 <a href={`https://www.google.com/maps?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--forest)', fontWeight: 600 }}>Haritada gör</a></>
        ) : (
          <> · <span className="muted">konum yok</span></>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Teslimat:</b> {o.deliveryWindow ? `${o.deliveryDate?.slice(0, 10)} · ${o.deliveryWindow}` : 'saat seçilmedi'}
        {' · '}<span className="tagp risk">{SUB_LABEL[o.substitutionPref] ?? SUB_LABEL.CALL}</span>
      </div>

      {o.note && <div style={{ marginBottom: 8 }}><b>Not:</b> {o.note}</div>}

      {o.slotChangeStatus === 'PENDING' && (
        <div style={{ margin: '10px 0', padding: '10px 12px', background: '#fff7ed', border: '1px solid var(--honey)', borderRadius: 10 }}>
          <div style={{ marginBottom: 8 }}>🕒 <b>Saat değişikliği talebi:</b> {o.deliveryDate?.slice(0, 10)} {o.deliveryWindow} → <b>{o.slotChangeDate?.slice(0, 10)} {o.slotChangeWindow}</b></div>
          {onSlotDecide && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" style={{ fontSize: 12, padding: '5px 12px' }} disabled={busy} onClick={() => onSlotDecide(true)}>✓ Onayla</button>
              <button className="btn ghost" style={{ fontSize: 12, padding: '5px 12px', color: 'var(--berry)' }} disabled={busy} onClick={() => onSlotDecide(false)}>✕ Reddet</button>
              <span className="muted" style={{ fontSize: 11 }}>İki durumda da müşteri bilgilendirilir.</span>
            </div>
          )}
        </div>
      )}

      <table style={{ marginTop: 6, background: '#fff', borderRadius: 10 }}>
        <thead><tr><th>Ürün</th><th className="num">İstenen</th><th className="num">Tartılan</th><th className="num">Satır</th></tr></thead>
        <tbody>
          {o.items.map((it) => (
            <tr key={it.id}>
              <td>
                {it.productName}
                {it.product?.stockQty != null && it.product.stockQty <= 0 && <span className="tagp zararina" style={{ marginLeft: 6 }}>stok bitti</span>}
                {it.note && <div style={{ fontSize: 11, color: 'var(--persimmon-d)', fontStyle: 'italic' }}>📝 {it.note}</div>}
                {(it.product?.substitutes?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    🔄 İkame: {it.product!.substitutes.filter((s) => s.substitute.isActive).map((s) => `${s.substitute.name}${s.substitute.stockQty != null && s.substitute.stockQty <= 0 ? ' (stok yok)' : ''}`).join(', ')}
                  </div>
                )}
              </td>
              <td className="num">{it.orderedQty} {it.unitLabel ?? ''}</td>
              <td className="num">{it.pickedQty != null ? `${it.pickedQty} ${it.unitLabel ?? ''}` : '—'}</td>
              <td className="num savecell">{tl(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10, display: 'grid', gap: 3, maxWidth: 280, marginLeft: 'auto', fontSize: 13 }}>
        {o.subtotal != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Ara toplam</span><span>{tl(o.subtotal)}</span></div>}
        {(o.discountTotal ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">🎟️ {o.couponCode}</span><span>−{tl(o.discountTotal!)}</span></div>}
        {o.deliveryFee != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Teslimat</span><span>{o.deliveryFee === 0 ? 'Ücretsiz' : tl(o.deliveryFee)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>{o.finalTotal != null ? 'Kesinleşen' : 'Tahmini'}</span><span>{tl(o.finalTotal ?? o.grandTotal)}</span>
        </div>
      </div>

      {(o.notifications?.length ?? 0) > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 12 }}>Gönderilen bildirimler</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {o.notifications!.map((n) => <li key={n.id}>🔔 {n.message}</li>)}
          </ul>
        </div>
      )}
      {(o.statusHistory?.length ?? 0) > 0 && (
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 12 }}>Zaman çizelgesi</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {o.statusHistory!.map((s) => (
              <li key={s.id} style={s.note?.startsWith('📌') ? { color: 'var(--persimmon-d)' } : undefined}>
                {s.note?.startsWith('📌')
                  ? <>{s.note} <span style={{ opacity: 0.7 }}>· {s.changedBy ?? ''} · {dt(s.createdAt)}</span></>
                  : <>{s.fromStatus && s.fromStatus !== s.toStatus ? `${STATUS_TR[s.fromStatus] ?? s.fromStatus} → ` : ''}<b>{STATUS_TR[s.toStatus] ?? s.toStatus}</b>{s.changedBy ? ` · ${s.changedBy}` : ''} · {dt(s.createdAt)}{s.note ? ` · ${s.note}` : ''}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onAddNote && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <input
            className="cell" style={{ flex: 1, textAlign: 'left' }} maxLength={300}
            placeholder="📌 Dahili not (müşteri görmez) — ör. kapıda bozuk para istiyor"
            value={noteText} onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && noteText.trim()) { onAddNote(noteText.trim()); setNoteText(''); } }}
          />
          <button className="btn ghost" style={{ fontSize: 12, padding: '5px 12px' }} disabled={busy || !noteText.trim()} onClick={() => { onAddNote(noteText.trim()); setNoteText(''); }}>
            Not ekle
          </button>
        </div>
      )}
    </div>
  );
}
