import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export const colors = {
  text: '#111827',
  muted: '#6b7280',
  border: '#d1d5db',
  primary: '#1d4ed8',
  onPrimary: '#ffffff',
  error: '#b91c1c',
  background: '#ffffff',
};

export function Button(props: {
  label: string;
  /** What a screen reader (and an agent driving the app) hears; defaults to the label. */
  accessibilityLabel?: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{
        selected: props.selected ?? false,
        disabled: props.disabled ?? false,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      testID={props.testID}
      style={[styles.button, props.selected && styles.buttonSelected]}
    >
      <Text style={[styles.buttonText, props.selected && styles.onPrimary]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** A labelled single-line text input. */
export function TextField(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        keyboardType={props.keyboardType ?? 'default'}
        value={props.value}
        onChangeText={props.onChangeText}
        style={styles.input}
      />
    </View>
  );
}

export function Loading(props: { label?: string }) {
  return (
    <ActivityIndicator
      accessibilityLabel={props.label ?? 'Loading'}
      size="small"
    />
  );
}

export function ErrorNote(props: { message: string; onRetry?: () => void }) {
  return (
    <>
      <Text style={styles.error} accessibilityRole="alert">
        {props.message}
      </Text>
      {props.onRetry && <Button label="Retry" onPress={props.onRetry} />}
    </>
  );
}

/** Save and Cancel for an inline form, with the reason the last save failed. */
export function FormActions(props: {
  saveLabel: string;
  saveAccessibilityLabel?: string;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <>
      <View style={styles.row}>
        <Button
          label={props.saveLabel}
          accessibilityLabel={props.saveAccessibilityLabel}
          disabled={!props.canSave}
          onPress={props.onSave}
        />
        <Button label="Cancel" onPress={props.onCancel} />
      </View>
      {props.error && <ErrorNote message={props.error} />}
    </>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.background },
  heading: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  error: { fontSize: 15, color: colors.error },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 2,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  buttonSelected: { backgroundColor: colors.primary },
  buttonText: { fontSize: 15, color: colors.primary },
  onPrimary: { color: colors.onPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
});
