import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { createApi } from '../api/client';
import { AppProviders } from '../app-providers';
import { Loading, styles } from '../components/ui';
import { API_URL } from '../config';
import { useSession } from '../session/session';
import { tokenStore } from '../session/token-store';

// Web target: when this page is the Google sign-in popup coming back, hand its address to the
// window that opened it, which closes the popup. Does nothing anywhere else (and on a phone).
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const api = useMemo(() => (API_URL ? createApi(API_URL) : null), []);
  if (!api) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>API address not configured</Text>
        <Text style={styles.body}>
          Set EXPO_PUBLIC_API_URL (see the README) and restart Metro.
        </Text>
      </View>
    );
  }
  return (
    <AppProviders api={api} store={tokenStore}>
      <Routes />
    </AppProviders>
  );
}

function Routes() {
  const { state } = useSession();
  if (state.status === 'loading') {
    return (
      <View style={styles.screen}>
        <Loading label="Restoring session" />
      </View>
    );
  }
  const signedIn = state.status === 'signedIn';
  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'Procurely' }} />
        <Stack.Screen name="suppliers" options={{ title: 'Suppliers' }} />
        <Stack.Screen name="catalog" options={{ title: 'Catalog' }} />
        <Stack.Screen name="requisitions" options={{ title: 'Requisitions' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
      </Stack.Protected>
    </Stack>
  );
}
