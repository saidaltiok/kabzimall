/**
 * Basit, harici servissiz rota optimizasyonu (günlük dağıtım).
 * Haversine mesafe + nearest-neighbor başlangıç + 2-opt iyileştirme.
 * Saf fonksiyonlar → test edilebilir. Mesafe km cinsinden.
 */
export interface GeoStop {
  lat: number;
  lng: number;
}

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: GeoStop, b: GeoStop): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** depot → sırayla duraklar → depot toplam mesafesi (gidiş-dönüş). */
export function routeDistanceKm(depot: GeoStop, stops: GeoStop[], order: number[]): number {
  if (order.length === 0) return 0;
  let total = haversineKm(depot, stops[order[0]]);
  for (let i = 1; i < order.length; i++) total += haversineKm(stops[order[i - 1]], stops[order[i]]);
  total += haversineKm(stops[order[order.length - 1]], depot);
  return total;
}

/** Nearest-neighbor: depottan başla, her adımda en yakın ziyaret edilmemiş durak. */
export function nearestNeighbor(depot: GeoStop, stops: GeoStop[]): number[] {
  const n = stops.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [];
  let cur: GeoStop = depot;
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = haversineKm(cur, stops[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    visited[best] = true;
    order.push(best);
    cur = stops[best];
  }
  return order;
}

/** 2-opt: segment ters çevirerek toplam mesafeyi iyileştir (yakınsayana dek). */
export function twoOpt(depot: GeoStop, stops: GeoStop[], initial: number[]): number[] {
  let order = [...initial];
  let best = routeDistanceKm(depot, stops, order);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
        const d = routeDistanceKm(depot, stops, cand);
        if (d + 1e-9 < best) { order = cand; best = d; improved = true; }
      }
    }
  }
  return order;
}

/** Uçtan uca: en iyi ziyaret sırası + toplam mesafe (km). */
export function optimize(depot: GeoStop, stops: GeoStop[]): { order: number[]; distanceKm: number } {
  if (stops.length === 0) return { order: [], distanceKm: 0 };
  const nn = nearestNeighbor(depot, stops);
  const order = twoOpt(depot, stops, nn);
  return { order, distanceKm: routeDistanceKm(depot, stops, order) };
}
