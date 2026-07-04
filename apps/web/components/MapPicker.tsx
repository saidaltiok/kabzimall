'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** "Konumumu bul" başarılı olunca gerçek konum (pin'den bağımsız) — uzaklık teyidi için. */
  onGeolocate?: (lat: number, lng: number) => void;
}

// İstanbul merkez — başlangıç görünümü (konum seçilmediyse).
const DEFAULT: [number, number] = [41.0082, 28.9784];

export default function MapPicker({ lat, lng, onChange, onGeolocate }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  // leaflet tipi bundle'a sokmadan referans tut.
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT;
      const map = L.map(elRef.current).setView(start, lat != null ? 16 : 11);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      const icon = L.divIcon({ className: 'map-pin', html: '📍', iconSize: [30, 30], iconAnchor: [15, 28] });
      const marker = L.marker(start, { draggable: true, icon }).addTo(map);
      markerRef.current = marker;
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChangeRef.current(p.lat, p.lng);
      });
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // yalnızca bir kez kur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate() {
    if (!navigator.geolocation || !mapRef.current || !markerRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current!.setView([latitude, longitude], 16);
        markerRef.current!.setLatLng([latitude, longitude]);
        onChangeRef.current(latitude, longitude);
        onGeolocate?.(latitude, longitude);
      },
      () => alert('Konum alınamadı. Tarayıcı izni gerekebilir; haritadan da seçebilirsiniz.'),
    );
  }

  return (
    <div>
      <div ref={elRef} style={{ height: 240, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line, #e2ded4)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
        <button type="button" className="back" style={{ cursor: 'pointer' }} onClick={locate}>📍 Konumumu bul</button>
        <span className="muted" style={{ fontSize: 12 }}>
          {lat != null && lng != null ? `Seçili nokta: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Haritaya dokunarak / pini sürükleyerek konumu işaretleyin'}
        </span>
      </div>
    </div>
  );
}
