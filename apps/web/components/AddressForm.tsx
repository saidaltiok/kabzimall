'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { AddressInput, SavedAddress } from '@/lib/api';
import { isName, isPhone, sanitizePhone, formatPhone } from '@/lib/validate';
import Icon from './Icon';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

/** Kayıtlı adres ekleme/düzenleme formu — harita konumu ZORUNLU. */
export default function AddressForm({
  initial, zones, busy, onSave, onCancel,
}: {
  initial?: SavedAddress | null;
  zones: string[];
  busy?: boolean;
  onSave: (a: AddressInput) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? 'Ev');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [addressText, setAddressText] = useState(initial?.addressText ?? '');
  const [district, setDistrict] = useState(initial?.district ?? '');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [touched, setTouched] = useState(false);

  const nameOk = isName(name);
  const phoneOk = isPhone(phone);
  const addrOk = addressText.trim().length >= 5;
  const labelOk = label.trim().length >= 1;
  const geoOk = !!geo;
  const zoneOk = zones.length === 0 || !!district;
  const valid = nameOk && phoneOk && addrOk && labelOk && geoOk && zoneOk;
  const err = { color: 'var(--berry, #b3261e)', fontSize: 12, marginTop: 4 } as const;

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <div className="field">
        <label>Etiket</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {['Ev', 'İş', 'Annem', 'Diğer'].map((l) => (
            <button key={l} type="button" onClick={() => setLabel(l)}
              style={{ border: `1.5px solid ${label === l ? 'var(--forest)' : 'var(--line)'}`, background: label === l ? 'var(--forest)' : '#fff', color: label === l ? '#fff' : 'inherit', borderRadius: 20, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ev, İş…" maxLength={40} />
      </div>
      <div className="field">
        <label>Ad Soyad (teslim alacak)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} placeholder="Ayşe Yılmaz" aria-invalid={touched && !nameOk} />
        {touched && !nameOk && <div style={err}>Ad ve soyad girin (en az 2 harf).</div>}
      </div>
      <div className="field">
        <label>Telefon</label>
        <input value={phone} inputMode="tel" onChange={(e) => setPhone(sanitizePhone(e.target.value))} onBlur={() => { setPhone((p) => formatPhone(p)); setTouched(true); }} placeholder="0555 555 55 55" aria-invalid={touched && !phoneOk} />
        {touched && !phoneOk && <div style={err}>Geçerli bir cep telefonu girin.</div>}
      </div>
      {zones.length > 0 && (
        <div className="field">
          <label>İlçe</label>
          <select value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">Seçiniz…</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>Adres</label>
        <textarea rows={2} value={addressText} onChange={(e) => setAddressText(e.target.value)} onBlur={() => setTouched(true)} placeholder="Mahalle, cadde, no, daire" aria-invalid={touched && !addrOk} />
        {touched && !addrOk && <div style={err}>Açık adres girin (mahalle, cadde, no).</div>}
      </div>
      <div className="field">
        <label>Haritada konum {geo ? <span className="save" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={14} /> işaretlendi</span> : <span style={{ color: 'var(--berry, #b3261e)' }}>* zorunlu</span>}</label>
        <MapPicker lat={geo?.lat ?? null} lng={geo?.lng ?? null} onChange={(lat, lng) => setGeo({ lat, lng })} />
        {touched && !geoOk && <div style={err}>Kuryenin sizi bulması için haritadan konumu işaretleyin.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="back" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '8px 12px' }} onClick={onCancel}>Vazgeç</button>
        <button className="cta" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} disabled={busy || !valid}
          onClick={() => { setTouched(true); if (valid) onSave({ label: label.trim(), name: name.trim(), phone: phone.trim(), addressText: addressText.trim(), district: district.trim() || null, lat: geo!.lat, lng: geo!.lng }); }}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}
