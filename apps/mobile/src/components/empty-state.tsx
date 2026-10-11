import { StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from './theme';
import { Button } from './ui';

const p = theme.palette;

export type EmptyStateProps = {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
};

/** A card that says a list has nothing in it yet, with an optional next step. */
export function EmptyState(props: EmptyStateProps) {
  const { action } = props;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{props.title}</Text>
      {props.body !== undefined && (
        <Text style={styles.body}>{props.body}</Text>
      )}
      {action !== undefined && (
        <View style={styles.action}>
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="secondary"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.card,
    backgroundColor: p.surface,
  },
  title: { fontFamily: fonts.medium, fontSize: 15, color: p.ink },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: p.muted,
  },
  action: { marginTop: theme.space.xs, alignItems: 'flex-start' },
});
