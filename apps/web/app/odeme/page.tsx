'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, customerSession } from '@/lib/api';

// Harita yalnızca istemcide (leaflet SSR'a girmez).
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });
import { useCart } from '@/lib/cart';
import { tl } from '@/lib/format';
import { rememberOrder } from '@/lib/orders';
import { DEFAULT_SETTINGS, type StoreSettings, feeForSubtotal } from '@/lib/delivery';

interface Slot { date: string; window: string; label: string }

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
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (items.length === 0)
    return (
      <div className="empty">
        <div className="big">🧺</div>
        <h2 className="serif">Sepetin boş</h2>
        <p><Link href="/" className="back">← Alışverişe başla</Link></p>
      </div>
    );

  async function placeOrder() {
    // Pin, cihazın gerçek konumundan belirgin uzaktaysa (>250 m) bilinçli mi diye sor —
    // yanlışlıkla haritaya dokunulup yanlış adrese gitmesin. Konum bilinmiyorsa atlanır.
    if (geo && geoSelf) {
      const km = distKm(geoSelf, geo);
      if (km > 0.25 && !confirm(`Seçtiğiniz teslimat noktası şu anki konumunuzdan ~${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km uzakta. Farklı bir adrese sipariş verdiğinizden emin misiniz?`)) {
        return;
      }
    }
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
      });
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
  const valid = name.trim().length >= 2 && phone.trim().length >= 7 && address.trim().length >= 5 && !!slotKey && (zones.length === 0 || !!district) && !belowMin;

  return (
    <>
      <h1 className="h1"><Link href="/sepet" className="back">‹</Link> Teslimat & Ödeme</h1>
      <div className="layout2">
        <div>
          <div className="block">
            <h3>Teslimat bilgileri</h3>
            <div className="field"><label>Ad Soyad</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayşe Yılmaz" /></div>
            <div className="field"><label>Telefon</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0555 555 55 55" /></div>
            <div className="field">
              <label>E-posta <span className="muted" style={{ fontWeight: 400 }}>(isteğe bağlı — sipariş güncellemeleri için)</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@eposta.com" />
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
            <div className="field"><label>Adres</label><textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Mahalle, cadde, no, daire" /></div>
            <div className="field">
              <label>Haritada konum {geo ? <span className="save">✓ işaretlendi</span> : <span className="muted">(kuryenin sizi kolay bulması için)</span>}</label>
              <MapPicker lat={geo?.lat ?? null} lng={geo?.lng ?? null} onChange={(lat, lng) => setGeo({ lat, lng })} onGeolocate={(lat, lng) => setGeoSelf({ lat, lng })} />
            </div>
            <div className="field"><label>Sipariş notu (opsiyonel)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zili çalmayın" /></div>
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
                    <span>{s.label}</span>
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
          <div className="ln"><span>Teslimat</span><span className="save">{fee === 0 ? 'Ücretsiz' : tl(fee)}</span></div>
          <div className="ln tot serif"><span>Tahmini toplam</span><span>{tl(subtotal + fee)}</span></div>
          <div className="note">Kesin tutar tartılı üründe paketlemede gramajla kesinleşir.</div>
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          <button className="cta" onClick={placeOrder} disabled={busy || !valid}>
            {busy ? 'Gönderiliyor…' : 'Siparişi onayla'}
          </button>
          {belowMin && <p className="note" style={{ color: 'var(--honey)' }}>Asgari sipariş tutarı {tl(minOrderTotal)}. Sepete {tl(minOrderTotal - subtotal)} daha ekleyin.</p>}
          {!valid && !belowMin && <p className="note">Ad, telefon, adresi doldurun ve teslimat saatini seçin.</p>}
        </div>
      </div>
    </>
  );
}
