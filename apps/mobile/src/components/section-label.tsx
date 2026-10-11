import { StyleSheet, Text } from 'react-native';
import { fonts, theme } from './theme';

/** The small uppercase label above a group of rows. */
export function SectionLabel(props: { label: string }) {
  return (
    <Text accessibilityRole="header" style={styles.label}>
      {props.label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: theme.space.sm,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.palette.muted,
  },
});
