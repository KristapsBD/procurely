import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'procurely.session-token';

/**
 * Where the session token lives between launches. On a phone it is the OS keychain/keystore
 * through expo-secure-store; the browser has no secure storage, so the web target (a dev and
 * agent-verification surface) falls back to localStorage.
 */
export interface TokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

const webStore: TokenStore = {
  load: async () => globalThis.localStorage?.getItem(KEY) ?? null,
  save: async (token) => globalThis.localStorage?.setItem(KEY, token),
  clear: async () => globalThis.localStorage?.removeItem(KEY),
};

const nativeStore: TokenStore = {
  load: () => SecureStore.getItemAsync(KEY),
  save: (token) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

export const tokenStore: TokenStore =
  Platform.OS === 'web' ? webStore : nativeStore;
