import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts as useFraunces, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  useFonts as useInter,
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import { CartProvider } from '../src/cart';
import { SessionProvider } from '../src/session';
import { FavoritesProvider } from '../src/favorites';
import { ToastProvider } from '../components/ui';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [fr] = useFraunces({ Fraunces_500Medium, Fraunces_600SemiBold });
  const [it] = useInter({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const ready = fr && it;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
      <FavoritesProvider>
      <CartProvider>
        <ToastProvider>
          {ready ? (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.cream },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="urun/[slug]" />
              <Stack.Screen name="odeme" />
              <Stack.Screen name="siparis/[id]" />
              <Stack.Screen name="favoriler" />
              <Stack.Screen name="adreslerim" />
              <Stack.Screen name="profil" />
              <Stack.Screen name="kuponlar" />
              <Stack.Screen name="bildirimler" />
              <Stack.Screen name="yardim" />
              <Stack.Screen name="yasal" />
              <Stack.Screen name="giris" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.forest} size="large" />
            </View>
          )}
        </ToastProvider>
      </CartProvider>
      </FavoritesProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
});
