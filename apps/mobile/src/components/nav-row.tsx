import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fonts, theme } from './theme';

const p = theme.palette;

/** A card-shaped row that opens another screen: title and meta on the left, a chevron on the right. */
export function NavRow(props: {
  title: string;
  meta?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.title}
      onPress={props.onPress}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.meta !== undefined && (
          <Text style={styles.meta}>{props.meta}</Text>
        )}
      </View>
      <Svg width={14} height={14} viewBox="0 0 14 14">
        <Path
          d="M5 3l4 4-4 4"
          stroke={p.muted}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.controlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: 14,
    paddingHorizontal: theme.space.lg,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.card,
    backgroundColor: p.surface,
  },
  text: { flex: 1, gap: theme.space.xs },
  title: { fontFamily: fonts.medium, fontSize: 15, color: p.ink },
  meta: { fontFamily: fonts.regular, fontSize: 14, color: p.muted },
});
