import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TimelineStep } from '../features/requisition-view';
import { formatMoney } from '../features/money';
import { Money } from './money';
import { fonts, theme } from './theme';

const p = theme.palette;

/** A small uppercase label above a block of the detail screens. */
export function SectionLabel(props: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionLabel}>
      {props.children}
    </Text>
  );
}

/** A grouped card whose rows are separated by hairlines. */
export function RowGroup(props: { children: ReactNode }) {
  return <View style={styles.group}>{props.children}</View>;
}

/** A whole-row button in a RowGroup: text on the left, an amount or badge on the right. */
export function TapRow(props: {
  title: string;
  meta: string;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.rowMeta}>{props.meta}</Text>
      </View>
      {props.trailing}
    </>
  );
  const rowStyle = [styles.row, props.last !== true && styles.rowDivider];
  if (!props.onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={rowStyle}
    >
      {body}
    </Pressable>
  );
}

/** Stacks the trailing pieces of a TapRow, right-aligned. */
export function TrailingColumn(props: { children: ReactNode }) {
  return <View style={styles.amountColumn}>{props.children}</View>;
}

/** Amount over a short hint, right-aligned, for the trailing side of a TapRow. */
export function AmountWithHint(props: {
  minor: number;
  currency: string;
  hint: string | null;
}) {
  return (
    <View style={styles.amountColumn}>
      <Money minor={props.minor} currency={props.currency} />
      {props.hint !== null && <Text style={styles.hint}>{props.hint}</Text>}
    </View>
  );
}

type Line = {
  id: string;
  catalogItemName: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
};

/** The lines of a requisition with their amounts, closed by the total. */
export function LinesCard(props: {
  lines: readonly Line[];
  totalMinor: number;
  currency: string;
}) {
  return (
    <View style={styles.card}>
      {props.lines.map((l) => (
        <View key={l.id} style={styles.lineRow}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{l.catalogItemName}</Text>
            <Text style={styles.rowMeta}>
              {`Qty ${l.quantity} × ${formatMoney(l.unitPriceMinor, props.currency)}`}
            </Text>
          </View>
          <Money minor={l.amountMinor} currency={props.currency} />
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.sectionLabel}>Total</Text>
        <Money
          minor={props.totalMinor}
          currency={props.currency}
          style={styles.total}
        />
      </View>
    </View>
  );
}

/** A note in the pending colours, such as which approval rule applies. */
export function Callout(props: { text: string }) {
  return (
    <View style={styles.callout}>
      <Text style={styles.calloutText}>{props.text}</Text>
    </View>
  );
}

/** A thin bar for received over ordered: accent when complete, warning colour while partial. */
export function ProgressBar(props: { received: number; ordered: number }) {
  const { received, ordered } = props;
  const complete = ordered > 0 && received >= ordered;
  const share = ordered > 0 ? Math.min(received / ordered, 1) : 0;
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          {
            width: `${share * 100}%`,
            backgroundColor: complete ? p.accent : p.pending,
          },
        ]}
      />
    </View>
  );
}

const DOT_COLORS = {
  done: p.accent,
  current: p.pending,
  rejected: p.rejected,
} as const;

/** The steps a requisition went through, the latest in bold. */
export function StatusTimeline(props: { steps: readonly TimelineStep[] }) {
  return (
    <View style={styles.timeline}>
      {props.steps.map((s) => (
        <View key={s.label} style={styles.step}>
          <View
            style={[styles.dot, { backgroundColor: DOT_COLORS[s.state] }]}
          />
          <Text
            style={[styles.stepLabel, s.state !== 'done' && styles.stepNow]}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: p.muted,
  },
  group: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  row: {
    minHeight: theme.controlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: 14,
    paddingHorizontal: theme.space.lg,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: p.divider },
  rowText: { flex: 1, gap: theme.space.xs },
  rowTitle: { fontFamily: fonts.medium, fontSize: 15, color: p.ink },
  rowMeta: { fontFamily: fonts.regular, fontSize: 13, color: p.muted },
  amountColumn: { alignItems: 'flex-end', gap: theme.space.xs },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: p.pending },
  card: {
    gap: theme.space.md,
    paddingVertical: 14,
    paddingHorizontal: theme.space.lg,
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.card,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: p.divider,
  },
  total: { fontSize: 20 },
  callout: {
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: p.pending,
    borderRadius: theme.radius.control,
    backgroundColor: p.pendingTint,
  },
  calloutText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: p.pending,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: p.controlTrack,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  timeline: { gap: theme.space.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stepLabel: { fontFamily: fonts.regular, fontSize: 14, color: p.ink },
  stepNow: { fontFamily: fonts.semibold },
});
