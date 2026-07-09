'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export interface RouteStop { seq: number; lat: number; lng: number; customerName: string; code: string }
interface Props {
  depot: { lat: number; lng: number };
  stops: RouteStop[];
}

export default function RouteMap({ depot, stops }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !elRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current).setView([depot.lat, depot.lng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
        setTimeout(() => mapRef.current?.invalidateSize(), 150);
      }
      const map = mapRef.current;
      const layer = layerRef.current!;
      layer.clearLayers();

      // Depo işareti (kurumsal store ikonu — Icon setiyle aynı çizim).
      const depotHtml = '<div style="background:#1F4D38;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">'
        + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M4 9.5 5.2 5h13.6L20 9.5" /><path d="M5.2 9.5V19.5h13.6V9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M9.5 19.5v-5h5v5" />'
        + '</svg></div>';
      L.marker([depot.lat, depot.lng], {
        icon: L.divIcon({ className: 'route-depot', html: depotHtml, iconSize: [28, 28], iconAnchor: [14, 26] }),
      }).addTo(layer).bindTooltip('Depo / dükkân');

      // Numaralı duraklar.
      for (const s of stops) {
        L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            className: 'route-stop',
            html: `<div style="background:#1F4D38;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.seq}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        }).addTo(layer).bindTooltip(`${s.seq}. ${s.customerName} (${s.code})`);
      }

      // Rota çizgisi: depot → duraklar → depot.
      const line: [number, number][] = [[depot.lat, depot.lng], ...stops.map((s) => [s.lat, s.lng] as [number, number]), [depot.lat, depot.lng]];
      const poly = L.polyline(line, { color: '#E4572E', weight: 3, opacity: 0.8, dashArray: '6 4' }).addTo(layer);
      if (stops.length > 0) map.fitBounds(poly.getBounds().pad(0.15));
    })();
    return () => { cancelled = true; };
  }, [depot, stops]);

  return <div ref={elRef} style={{ height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line, #e2ded4)' }} />;
}
