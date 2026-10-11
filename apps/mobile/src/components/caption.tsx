import { StyleSheet, Text } from 'react-native';
import { fonts, theme } from './theme';

/** A small uppercase label above a group of fields or rows. */
export function Caption(props: { children: string }) {
  return <Text style={styles.caption}>{props.children}</Text>;
}

const styles = StyleSheet.create({
  caption: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.palette.muted,
  },
});
