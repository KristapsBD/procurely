import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fonts, theme } from './theme';

const p = theme.palette;

/** The note a buyer left on a receipt line, in the rejected tint so damage is hard to miss. */
export function ReceiptNote(props: { kind: string; text: string }) {
  return (
    <View style={styles.box}>
      <Svg width={16} height={16} viewBox="0 0 24 24" style={styles.icon}>
        <Path
          d="M12 3l10 18H2zM12 10v5M12 18h.01"
          stroke={p.rejected}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={styles.text}>
        <Text style={styles.kind}>{`${props.kind}. `}</Text>
        {props.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.sm,
    paddingVertical: 10,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.chip,
    backgroundColor: p.rejectedTint,
  },
  icon: { marginTop: 1 },
  text: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: p.rejected,
  },
  kind: { fontFamily: fonts.semibold },
});
