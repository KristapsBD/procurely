import type { GoogleSignInErrorReason } from '@procurely/shared-types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { queryKeys } from '../api/query-keys';
import { API_URL } from '../config';
import { DEV_PEOPLE } from '../features/dev-people';
import { Button, ErrorNote, Loading, colors, styles } from '../components/ui';
import {
  createPkcePair,
  GoogleSignInError,
  signInWithGoogle,
  type PkcePair,
} from '../session/google-sign-in';
import { useApi, useSession } from '../session/session';

export function LoginScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <GoogleSignIn />
      {/* The API refuses the dev login outside development; do not offer it in a release bundle. */}
      {__DEV__ && <DevLogin />}
    </ScrollView>
  );
}

const GOOGLE_FAILED = `Could not complete Google sign-in. Is the API reachable at ${API_URL}?`;
const GOOGLE_ERRORS: Record<GoogleSignInErrorReason, string> = {
  cancelled: 'Google sign-in was cancelled.',
  rejected:
    'Google could not confirm this account. Its email address must be verified. Try again.',
  unsupported:
    'Sign in with a Gmail address or a Google Workspace account: Google cannot confirm that the email address of this account is yours.',
  conflict:
    'This Google account cannot sign in here: its email address already belongs to another account. Ask an admin of your company.',
  failed: GOOGLE_FAILED,
};

function googleErrorMessage(error: unknown): string {
  return error instanceof GoogleSignInError
    ? GOOGLE_ERRORS[error.reason]
    : GOOGLE_FAILED;
}

/** A fresh PKCE pair per attempt, made before the tap (see createPkcePair). */
function usePkcePair(attempt: number): PkcePair | null {
  const [pair, setPair] = useState<{ attempt: number; pkce: PkcePair }>();
  useEffect(() => {
    let current = true;
    void createPkcePair().then((pkce) => current && setPair({ attempt, pkce }));
    return () => {
      current = false;
    };
  }, [attempt]);
  return pair?.attempt === attempt ? pair.pkce : null;
}

function GoogleSignIn() {
  const api = useApi();
  const options = useQuery({
    queryKey: queryKeys.authOptions,
    queryFn: () => api.authOptions(),
  });

  if (options.isPending) return <Loading label="Loading sign-in options" />;
  if (options.isError) {
    return (
      <ErrorNote
        message={`Could not reach the API at ${API_URL}.`}
        onRetry={() => void options.refetch()}
      />
    );
  }
  if (!options.data.google) {
    return (
      <Text style={styles.muted}>
        Google sign-in is not configured on this server.
      </Text>
    );
  }
  return <GoogleButton />;
}

function GoogleButton() {
  const api = useApi();
  const { startSession } = useSession();
  const [attempt, setAttempt] = useState(0);
  const pkce = usePkcePair(attempt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(pair: PkcePair) {
    setBusy(true);
    setError(null);
    try {
      const session = await signInWithGoogle(api, pair);
      if (session) return await startSession(session);
    } catch (e) {
      setError(googleErrorMessage(e));
    }
    setBusy(false);
    setAttempt((n) => n + 1); // a verifier is never used twice
  }

  return (
    <View style={{ gap: 8 }}>
      <Button
        label="Sign in with Google"
        disabled={busy || !pkce}
        onPress={() => pkce && void signIn(pkce)}
      />
      {busy && <Loading label="Signing in with Google" />}
      {error && <ErrorNote message={error} />}
    </View>
  );
}

/** Dev login: signs in as a seeded person by id. */
function DevLogin() {
  const { signIn } = useSession();
  const [personId, setPersonId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(id: string) {
    setBusy(true);
    setError(null);
    try {
      await signIn(id.trim());
    } catch {
      setError(`Could not sign in. Is the API reachable at ${API_URL}?`);
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.heading}>Dev login</Text>
      <Text style={styles.muted}>Sign in as a seeded person.</Text>
      {DEV_PEOPLE.map((person) => (
        <View key={person.id} style={styles.card}>
          <Button
            label={`Sign in as ${person.name}`}
            disabled={busy}
            onPress={() => void login(person.id)}
          />
          <Text style={styles.muted}>{person.note}</Text>
        </View>
      ))}
      <TextInput
        accessibilityLabel="Person id"
        placeholder="Any seeded person id"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={personId}
        onChangeText={setPersonId}
        style={styles.input}
      />
      <Button
        label="Sign in with id"
        disabled={busy || personId.trim() === ''}
        onPress={() => void login(personId)}
      />
      {busy && <Loading label="Signing in" />}
      {error && <ErrorNote message={error} />}
    </View>
  );
}
