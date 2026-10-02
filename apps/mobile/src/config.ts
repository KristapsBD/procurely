/**
 * Base URL of the API: the one place the app learns where the backend is. Expo inlines
 * EXPO_PUBLIC_* variables at bundle time, so this must stay a literal `process.env` access.
 */
export const API_URL: string | undefined = process.env.EXPO_PUBLIC_API_URL;
