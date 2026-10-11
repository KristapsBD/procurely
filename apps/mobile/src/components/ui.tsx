import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fonts, theme } from './theme';

export { Money } from './money';
export { StatusBadge, statusLabel } from './status-badge';

const p = theme.palette;

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

const BUTTON_VARIANTS: Record<
  ButtonVariant,
  { background: string; border: string; text: string }
> = {
  primary: { background: p.accent, border: p.accent, text: p.onAccent },
  secondary: { background: p.surface, border: p.control, text: p.ink },
  destructive: { background: p.surface, border: p.rejected, text: p.rejected },
};

export function Button(props: {
  label: string;
  /** What a screen reader (and an agent driving the app) hears; defaults to the label. */
  accessibilityLabel?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  selected?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const v =
    BUTTON_VARIANTS[
      props.selected ? 'primary' : (props.variant ?? 'secondary')
    ];
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
      style={[
        styles.button,
        { backgroundColor: v.background, borderColor: v.border },
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, { color: v.text }]}>{props.label}</Text>
    </Pressable>
  );
}

/** A card row: title and meta on the left, an amount or badge on the right. */
export function ListRow(props: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.listRow}>
        <View style={styles.listRowText}>
          <Text style={styles.rowTitle}>{props.title}</Text>
          {props.meta !== undefined && (
            <Text style={styles.muted}>{props.meta}</Text>
          )}
        </View>
        {props.trailing}
      </View>
      {props.children}
    </View>
  );
}

function roleName(role: string): string {
  return role.slice(0, 1) + role.slice(1).toLowerCase();
}

function Chevron() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path
        d="M3 5l4 4 4-4"
        stroke={p.muted}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** The company the person acts in and their role there; with several companies it opens a picker. */
export function CompanyChip(props: {
  companies: { companyId: string; companyName: string; role: string }[];
  activeCompanyId: string;
  onSelect: (companyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = props.companies.find(
    (c) => c.companyId === props.activeCompanyId,
  );
  if (!active) return null;
  const content = (
    <>
      <View style={styles.chipMark}>
        <Text style={styles.chipMarkText}>
          {active.companyName.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.chipName}>{active.companyName}</Text>
      <Text style={styles.muted}>{`· ${roleName(active.role)}`}</Text>
    </>
  );
  if (props.companies.length < 2) {
    return <View style={[styles.chip, styles.chipPill]}>{content}</View>;
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch company"
        onPress={() => setOpen(true)}
        style={[styles.chip, styles.chipPill]}
      >
        {content}
        <Chevron />
      </Pressable>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.pickerBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close company picker"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={styles.pickerSheet}>
            {props.companies.map((c) => {
              const selected = c.companyId === props.activeCompanyId;
              return (
                <Pressable
                  key={c.companyId}
                  accessibilityRole="button"
                  accessibilityLabel={c.companyName}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setOpen(false);
                    if (!selected) props.onSelect(c.companyId);
                  }}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={styles.chipName}>{c.companyName}</Text>
                  <Text style={styles.muted}>{`· ${roleName(c.role)}`}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

export function SegmentedControl<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => props.onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={selected ? styles.rowTitle : styles.muted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        placeholder={props.placeholder}
        placeholderTextColor={p.muted}
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
      color={p.accent}
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
          variant="primary"
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
  screen: {
    flex: 1,
    padding: theme.space.xl,
    gap: theme.space.md,
    backgroundColor: p.ground,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: p.ink,
  },
  body: { fontFamily: fonts.regular, fontSize: 15, color: p.ink },
  rowTitle: { fontFamily: fonts.medium, fontSize: 15, color: p.ink },
  muted: { fontFamily: fonts.regular, fontSize: 14, color: p.muted },
  error: { fontFamily: fonts.regular, fontSize: 15, color: p.rejected },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  card: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.card,
    paddingVertical: 14,
    paddingHorizontal: theme.space.lg,
    gap: theme.space.xs,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  listRowText: { flex: 1, gap: theme.space.xs },
  button: {
    minHeight: theme.controlHeight,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.control,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15 },
  disabled: { opacity: 0.45 },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: p.muted,
  },
  input: {
    minHeight: theme.controlHeight,
    borderWidth: 1,
    borderColor: p.control,
    borderRadius: theme.radius.chip,
    backgroundColor: p.surface,
    paddingHorizontal: theme.space.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: p.ink,
  },
  chip: {
    minHeight: theme.controlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: theme.radius.chip,
    backgroundColor: p.surface,
  },
  chipPill: { alignSelf: 'flex-start' },
  chipActive: { borderColor: p.accent },
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(22,32,27,0.4)',
  },
  pickerSheet: {
    gap: theme.space.sm,
    padding: theme.space.xl,
    backgroundColor: p.ground,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
  },
  segmentBar: {
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.md,
    backgroundColor: p.ground,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: theme.radius.chip,
    backgroundColor: p.controlTrack,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentSelected: { backgroundColor: p.surface },
  chipMark: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.badge,
    backgroundColor: p.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipMarkText: { fontFamily: fonts.semibold, fontSize: 12, color: p.onAccent },
  chipName: { fontFamily: fonts.medium, fontSize: 14, color: p.ink },
});
