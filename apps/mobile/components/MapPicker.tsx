import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { colors, fonts, radius } from '../src/theme';

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** "Konumumu bul" başarılı olunca cihazın gerçek konumu (pin'den bağımsız) — uzaklık teyidi için. */
  onGeolocate?: (lat: number, lng: number) => void;
}

// İstanbul merkez — başlangıç görünümü (konum seçilmediyse). Web MapPicker ile aynı.
const DEFAULT: [number, number] = [41.0082, 28.9784];

/** Leaflet + OpenStreetMap'i WebView içinde çalıştırır (Expo Go uyumlu; web vitrini ile aynı deneyim). */
function buildHtml(lat: number | null, lng: number | null): string {
  const start = lat != null && lng != null ? [lat, lng] : DEFAULT;
  const zoom = lat != null ? 16 : 11;
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0}#map{background:#e7e0d2}.lp{font-size:28px;line-height:28px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var start=[${start[0]},${start[1]}];
  var map=L.map('map',{zoomControl:true,attributionControl:false}).setView(start, ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  var icon=L.divIcon({className:'',html:'<div class="lp">📍</div>',iconSize:[30,30],iconAnchor:[15,28]});
  var marker=L.marker(start,{draggable:true,icon:icon}).addTo(map);
  function send(p){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify({lat:p.lat,lng:p.lng})); } }
  marker.on('dragend', function(){ send(marker.getLatLng()); });
  map.on('click', function(e){ marker.setLatLng(e.latlng); send(e.latlng); });
  // RN → harita: pini taşı ve ortala.
  window.setPin=function(la,ln){ marker.setLatLng([la,ln]); map.setView([la,ln],16); };
  setTimeout(function(){ map.invalidateSize(); },300);
</script></body></html>`;
}

export function MapPicker({ lat, lng, onChange, onGeolocate }: Props) {
  const webRef = useRef<WebView>(null);
  const [locating, setLocating] = useState(false);
  // Kaynağı YALNIZ bir kez kur (lat/lng değişince WebView reload olmasın) — güncelleme injectJavaScript ile.
  const initial = useRef({ lat, lng });
  const html = useMemo(() => buildHtml(initial.current.lat, initial.current.lng), []);

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    try {
      const p = JSON.parse(e.nativeEvent.data);
      if (typeof p.lat === 'number' && typeof p.lng === 'number') onChange(p.lat, p.lng);
    } catch { /* yoksay */ }
  };

  const locate = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Konum izni', 'Konum alınamadı. Haritadan pini sürükleyerek de işaretleyebilirsin.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webRef.current?.injectJavaScript(`window.setPin(${latitude},${longitude}); true;`);
      onChange(latitude, longitude);
      onGeolocate?.(latitude, longitude);
    } catch {
      Alert.alert('Konum', 'Konum alınamadı. Haritadan seçebilirsin.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View>
      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          style={styles.map}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View>
          )}
        />
      </View>
      <View style={styles.row}>
        <Pressable style={styles.locateBtn} onPress={locate} disabled={locating}>
          {locating ? <ActivityIndicator color={colors.forest} size="small" />
            : <Text style={styles.locateTxt}>📍 Konumumu bul</Text>}
        </Pressable>
        <Text style={styles.coords}>
          {lat != null && lng != null
            ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
            : 'Haritaya dokun / pini sürükle'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { height: 220, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.creamDark },
  map: { flex: 1, backgroundColor: colors.creamDark },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.creamDark },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  locateBtn: { backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9 },
  locateTxt: { color: colors.forest, fontFamily: fonts.bodySemi, fontSize: 12.5 },
  coords: { flex: 1, textAlign: 'right', color: colors.muted, fontSize: 11.5, fontFamily: fonts.body },
});
