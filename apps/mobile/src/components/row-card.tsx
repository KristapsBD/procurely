import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from './theme';

const p = theme.palette;

export function RowCard(props: { children: ReactNode }) {
  const rows = Children.toArray(props.children);
  return (
    <View style={styles.card}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={styles.divider} />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function RowItem(props: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      <View style={styles.text}>
        <Text style={styles.title}>{props.title}</Text>
        {props.meta !== undefined && (
          <Text style={styles.meta}>{props.meta}</Text>
        )}
      </View>
      {props.trailing !== undefined && (
        <View style={styles.trailing}>{props.trailing}</View>
      )}
    </>
  );
  if (props.onPress === undefined) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      onPress={props.onPress}
      style={styles.row}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.card,
    backgroundColor: p.surface,
  },
  divider: { height: 1, backgroundColor: p.divider },
  row: {
    minHeight: theme.controlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: 14,
    paddingHorizontal: theme.space.lg,
  },
  text: { flex: 1, gap: theme.space.xs },
  trailing: { alignItems: 'flex-end', gap: theme.space.xs },
  title: { fontFamily: fonts.medium, fontSize: 15, color: p.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: p.muted },
});
