import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ActiveCompanyChip } from './active-company-chip';
import { fonts, theme } from './theme';

const p = theme.palette;

export type ScreenHeaderLead =
  { kind: 'company' } | { kind: 'back'; label: string; onPress: () => void };

export type ScreenHeaderProps = {
  title: string;
  /** Muted text right-aligned on the title line ("3 waiting for you"). */
  meta?: string;
  /** A node right-aligned on the title line, such as a StatusBadge. */
  aside?: ReactNode;
  subtitle?: string;
  lead: ScreenHeaderLead;
};

/** The top of a screen: the company chip or a back pill, then the title line and subtitle. */
export function ScreenHeader(props: ScreenHeaderProps) {
  const { lead } = props;
  return (
    <View style={styles.header}>
      {lead.kind === 'company' ? (
        <ActiveCompanyChip />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${lead.label}`}
          onPress={lead.onPress}
          style={styles.back}
        >
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path
              d="M9 3L5 7l4 4"
              stroke={p.ink}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
          <Text style={styles.backLabel}>{lead.label}</Text>
        </Pressable>
      )}
      <View style={styles.titleLine}>
        <Text
          accessibilityRole="header"
          style={[styles.title, lead.kind === 'back' && styles.titleDetail]}
        >
          {props.title}
        </Text>
        {props.meta !== undefined && (
          <Text style={styles.meta}>{props.meta}</Text>
        )}
        {props.aside}
      </View>
      {props.subtitle !== undefined && (
        <Text style={styles.subtitle}>{props.subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.space.md },
  back: {
    minHeight: theme.controlHeight,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    borderWidth: 1,
    borderColor: p.control,
    borderRadius: theme.radius.chip,
    backgroundColor: p.surface,
  },
  backLabel: { fontFamily: fonts.medium, fontSize: 14, color: p.ink },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 28,
    color: p.ink,
  },
  titleDetail: { fontSize: 22 },
  meta: { fontFamily: fonts.regular, fontSize: 14, color: p.muted },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, color: p.muted },
});
