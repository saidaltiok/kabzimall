'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, customerSession, savedCoupon, clearCoupon } from '@/lib/api';

// Harita yalnızca istemcide (leaflet SSR'a girmez).
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';
import { rememberOrder } from '@/lib/orders';
import { DEFAULT_SETTINGS, type StoreSettings, feeForSubtotal } from '@/lib/delivery';
import { isName, isPhone, isEmail, sanitizePhone, formatPhone } from '@/lib/validate';
import Modal from '@/components/Modal';
import TrustBadges from '@/components/TrustBadges';

interface Slot { date: string; window: string; label: string; remaining: number | null }

/** Hazır teslimat notu çipleri — serbest metin yerine tek dokunuş. */
const NOTE_CHIPS = ['Kapıya bırak', 'Zili çalma', 'Gelmeden ara', 'Poşetleri ayır'];

type SubPref = 'CALL' | 'REMOVE' | 'SUBSTITUTE';
const SUB_PREFS: { id: SubPref; icon: string; title: string; desc: string }[] = [
  { id: 'CALL', icon: '📞', title: 'Beni arayın', desc: 'Telefonla sorulmadan değişiklik yapılmaz' },
  { id: 'REMOVE', icon: '➖', title: 'Eksik ürünü çıkarın', desc: 'Tutar düşer, kalanlar teslim edilir' },
  { id: 'SUBSTITUTE', icon: '🔄', title: 'Benzeriyle değiştirin', desc: 'En yakın taze muadili konur' },
];

/** İki nokta arası kuş uçuşu km (haversine) — konum teyidi için. */
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotKey, setSlotKey] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [district, setDistrict] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  /** Cihazın gerçek konumu (pin'den bağımsız) — "farklı yer seçtiniz" teyidi için. */
  const [geoSelf, setGeoSelf] = useState<{ lat: number; lng: number } | null>(null);
  const [subPref, setSubPref] = useState<SubPref>('CALL');
  /** Mesafeli satış + KVKK onayı — işaretlenmeden sipariş verilemez (yasal gereklilik). */
  const [consent, setConsent] = useState(false);
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // sipariş onay modalı
  /** Alanlara dokunulunca hata gösterilir (baştan kırmızı olmasın). */
  const [touched, setTouched] = useState<{ [k: string]: boolean }>({});
  const touch = (f: string) => setTouched((t) => ({ ...t, [f]: true }));

  useEffect(() => {
    // Girişli müşterinin doğrulanmış e-postasını önden doldur (değiştirilebilir).
    const s = customerSession();
    if (s) setEmail((cur) => cur || s.email);
    apiGet<{ data: Slot[] }>('/storefront/slots').then((r) => setSlots(r.data)).catch(() => {});
    apiGet<{ data: { name: string }[] }>('/storefront/zones').then((r) => setZones(r.data.map((z) => z.name))).catch(() => {});
    apiGet<StoreSettings>('/storefront/settings').then(setSettings).catch(() => {});
    // Konum izni ZATEN verilmişse gerçek konumu sessizce al (izin sorusu açtırmaz) —
    // haritada uzak bir yere pin bırakılırsa siparişte teyit sorabilelim.
    try {
      navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((p) => {
        if (p.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            (pos) => setGeoSelf({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {},
          );
        }
      }).catch(() => {});
    } catch { /* eski tarayıcı → teyit atlanır */ }
  }, []);

  // Sepette uygulanan kupon — sepet hydrate olduktan sonra güncel ara toplamla doğrula.
  useEffect(() => {
    const cc = savedCoupon();
    if (!cc || subtotal <= 0) return;
    apiGet<{ valid: boolean; code: string; discount: number }>(
      `/storefront/coupons/check?code=${encodeURIComponent(cc)}&subtotal=${subtotal}`,
    ).then((r) => { if (r.valid) setCoupon({ code: r.code, discount: r.discount }); else { setCoupon(null); clearCoupon(); } }).catch(() => {});
  }, [subtotal]);

  if (items.length === 0)
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <h2 className="serif">Sepetin boş</h2>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  // Pin, cihazın gerçek konumundan belirgin uzaktaysa (>250 m) onay modalında uyar.
  const farKm = geo && geoSelf ? distKm(geoSelf, geo) : 0;
  const farWarn = farKm > 0.25;

  async function submitOrder() {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    try {
      const slot = slots.find((s) => `${s.date}|${s.window}` === slotKey);
      const order = await apiPost<{ id: string; code: string }>('/storefront/orders', {
        items: items.map((i) => ({ slug: i.slug, qty: i.qty, basketSlug: i.basketSlug, note: i.note })),
        customer: { name, phone, email: email.trim() || undefined, address, district: district || undefined, lat: geo?.lat, lng: geo?.lng },
        slot: slot ? { date: slot.date, window: slot.window } : undefined,
        note: note || undefined,
        substitutionPref: subPref,
        couponCode: coupon?.code,
      });
      clearCoupon();
      rememberOrder(order.id, order.code);
      clear();
      router.push(`/siparis/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const { minOrderTotal, deliveryTiers } = settings;
  const fee = feeForSubtotal(subtotal, deliveryTiers);
  const belowMin = minOrderTotal > 0 && subtotal < minOrderTotal;
  // Alan bazlı doğrulama (backend ile aynı kurallar).
  const nameOk = isName(name);
  const phoneOk = isPhone(phone);
  const addressOk = address.trim().length >= 5;
  const emailOk = email.trim() === '' || isEmail(email);
  const valid = nameOk && phoneOk && addressOk && emailOk && !!slotKey && (zones.length === 0 || !!district) && !belowMin && consent;
  const errStyle = { color: 'var(--berry, #b3261e)', fontSize: 12, marginTop: 4 } as const;

  return (
    <>
      <h1 className="h1"><Link href="/sepet" className="back">‹</Link> Teslimat & Ödeme</h1>
      <div className="layout2">
        <div>
          <div className="block">
            <h3>Teslimat bilgileri</h3>
            <div className="field">
              <label>Ad Soyad</label>
              <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => touch('name')} placeholder="Ayşe Yılmaz" aria-invalid={touched.name && !nameOk} />
              {touched.name && !nameOk && <div style={errStyle}>Adınızı ve soyadınızı girin (en az 2 harf).</div>}
            </div>
            <div className="field">
              <label>Telefon</label>
              <input
                value={phone} inputMode="tel"
                onChange={(e) => setPhone(sanitizePhone(e.target.value))}
                onBlur={() => { setPhone((p) => formatPhone(p)); touch('phone'); }}
                placeholder="0555 555 55 55" aria-invalid={touched.phone && !phoneOk}
              />
              {touched.phone && !phoneOk && <div style={errStyle}>Geçerli bir cep telefonu girin (05XX XXX XX XX).</div>}
            </div>
            <div className="field">
              <label>E-posta <span className="muted" style={{ fontWeight: 400 }}>(isteğe bağlı — sipariş güncellemeleri için)</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => touch('email')} placeholder="ornek@eposta.com" aria-invalid={touched.email && !emailOk} />
              {touched.email && !emailOk && <div style={errStyle}>Geçerli bir e-posta girin ya da boş bırakın.</div>}
            </div>
            {zones.length > 0 && (
              <div className="field">
                <label>İlçe (teslimat bölgesi)</label>
                <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  <option value="">Seçiniz…</option>
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Adres</label>
              <textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} onBlur={() => touch('address')} placeholder="Mahalle, cadde, no, daire" aria-invalid={touched.address && !addressOk} />
              {touched.address && !addressOk && <div style={errStyle}>Kuryenin bulabilmesi için açık adres girin (mahalle, cadde, no).</div>}
            </div>
            <div className="field">
              <label>Haritada konum {geo ? <span className="save">✓ işaretlendi</span> : <span className="muted">(kuryenin sizi kolay bulması için)</span>}</label>
              <MapPicker lat={geo?.lat ?? null} lng={geo?.lng ?? null} onChange={(lat, lng) => setGeo({ lat, lng })} onGeolocate={(lat, lng) => setGeoSelf({ lat, lng })} />
            </div>
            <div className="field">
              <label>Sipariş notu (opsiyonel)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0 8px' }}>
                {NOTE_CHIPS.map((chip) => {
                  const active = note.includes(chip);
                  return (
                    <button
                      key={chip} type="button"
                      onClick={() => setNote((n) => active ? n.split(/,\s*/).filter((x) => x !== chip).join(', ') : (n ? `${n}, ${chip}` : chip))}
                      style={{
                        border: `1.5px solid ${active ? 'var(--forest)' : 'var(--line)'}`, background: active ? 'var(--forest)' : '#fff',
                        color: active ? '#fff' : 'inherit', borderRadius: 20, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      {active ? '✓ ' : ''}{chip}
                    </button>
                  );
                })}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zili çalmayın" />
            </div>
          </div>
          <div className="block">
            <h3>Teslimat saati</h3>
            {slots.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Slotlar yükleniyor…</p>
            ) : (
              slots.map((s) => {
                const key = `${s.date}|${s.window}`;
                return (
                  <div
                    key={key}
                    className={`choice ${slotKey === key ? 'sel' : ''}`}
                    style={{ marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => setSlotKey(key)}
                  >
                    <span>
                      {s.label}
                      {s.remaining != null && s.remaining <= 3 && (
                        <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: 'var(--persimmon-d)', background: '#fbeee6', borderRadius: 20, padding: '2px 8px' }}>son {s.remaining} yer</span>
                      )}
                    </span>
                    <span>{slotKey === key ? '✓' : ''}</span>
                  </div>
                );
              })
            )}
          </div>
          <div className="block">
            <h3>Ürün eksik çıkarsa?</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 2px 10px' }}>
              Taze üründe gün içinde tükenme olabilir. Sipariş hazırlanırken bir ürün eksik çıkarsa ne yapalım?
            </p>
            {SUB_PREFS.map((p) => (
              <div
                key={p.id}
                className={`choice ${subPref === p.id ? 'sel' : ''}`}
                style={{ marginBottom: 8, cursor: 'pointer' }}
                onClick={() => setSubPref(p.id)}
              >
                <div>{p.icon} <b>{p.title}</b><div className="muted" style={{ fontSize: 12 }}>{p.desc}</div></div>
                <span>{subPref === p.id ? '✓' : ''}</span>
              </div>
            ))}
          </div>
          <div className="block">
            <h3>Ödeme yöntemi</h3>
            <div className="choice sel"><div>💵 <b>Kapıda ödeme</b><div className="muted" style={{ fontSize: 12 }}>Nakit / kart</div></div><span>✓</span></div>
            <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>Online ödeme (kart) yakında.</p>
          </div>
        </div>

        <div className="summary">
          <div className="ln"><span>Ara toplam ({items.length} ürün)</span><span>{tl(subtotal)}</span></div>
          {coupon && <div className="ln"><span>Kupon <b>{coupon.code}</b></span><span className="save">−{tl(coupon.discount)}</span></div>}
          <div className="ln"><span>Teslimat</span><span className="save">{fee === 0 ? 'Ücretsiz' : tl(fee)}</span></div>
          <div className="ln tot serif"><span>Tahmini toplam</span><span>{tl(subtotal - (coupon?.discount ?? 0) + fee)}</span></div>
          <div className="note">Kesin tutar tartılı üründe paketlemede gramajla kesinleşir.</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, marginTop: 12, cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              <a href="/mesafeli-satis" target="_blank" style={{ color: 'var(--forest)', fontWeight: 600 }}>Mesafeli Satış Sözleşmesi</a>&apos;ni ve{' '}
              <a href="/kvkk" target="_blank" style={{ color: 'var(--forest)', fontWeight: 600 }}>KVKK Aydınlatma Metni</a>&apos;ni okudum, kabul ediyorum.
            </span>
          </label>
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          <button className="cta" onClick={() => setConfirmOpen(true)} disabled={busy || !valid}>
            {busy ? 'Gönderiliyor…' : 'Siparişi onayla'}
          </button>
          {belowMin && <p className="note" style={{ color: 'var(--honey)' }}>Asgari sipariş tutarı {tl(minOrderTotal)}. Sepete {tl(minOrderTotal - subtotal)} daha ekleyin.</p>}
          {!valid && !belowMin && <p className="note">Ad, telefon, adresi doldurun; teslimat saatini seçin ve sözleşmeyi onaylayın.</p>}
          <TrustBadges compact />
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Siparişi onayla"
        footer={
          <>
            <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '8px 12px' }} onClick={() => setConfirmOpen(false)}>Vazgeç</button>
            <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} disabled={busy} onClick={submitOrder}>
              {busy ? 'Gönderiliyor…' : 'Evet, siparişi ver'}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Ürün</span><span>{items.length} kalem</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Teslimat</span><span>{slots.find((s) => `${s.date}|${s.window}` === slotKey)?.label ?? '—'}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Adres</span><span style={{ maxWidth: 220, textAlign: 'right' }}>{district ? `${district} · ` : ''}{address}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Ödeme</span><span>Kapıda ödeme (nakit/kart)</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, marginTop: 4 }}>
            <span>Tahmini toplam</span><span>{tl(subtotal - (coupon?.discount ?? 0) + fee)}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>Tartılı üründe kesin tutar paketlemede gramajla kesinleşir.</p>
          {farWarn && (
            <div className="error" style={{ marginTop: 8 }}>
              ⚠️ Seçtiğiniz teslimat noktası şu anki konumunuzdan ~{farKm < 10 ? farKm.toFixed(1).replace('.', ',') : Math.round(farKm)} km uzakta.
              Farklı bir adrese sipariş veriyorsanız sorun yok; emin olun.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
