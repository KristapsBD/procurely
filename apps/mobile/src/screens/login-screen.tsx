import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { API_URL } from '../config';
import { DEV_PEOPLE } from '../features/dev-people';
import { Button, ErrorNote, Loading, colors, styles } from '../components/ui';
import { useSession } from '../session/session';

/** Dev login: signs in as a seeded person by id. Google sign-in replaces this later. */
export function LoginScreen() {
  // The API refuses the dev login outside development; do not offer it in a release bundle.
  return __DEV__ ? (
    <DevLogin />
  ) : (
    <Text style={styles.body}>Sign-in is not available yet.</Text>
  );
}

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
    <ScrollView contentContainerStyle={styles.screen}>
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
    </ScrollView>
  );
}
