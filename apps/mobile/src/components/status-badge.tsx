import type { PurchaseOrder, RequisitionStatus } from '@procurely/shared-types';
import { Text, View } from 'react-native';
import { fonts, theme, type Palette } from './theme';

export type AnyStatus = RequisitionStatus | PurchaseOrder['status'];

type Tone = 'neutral' | 'pending' | 'accent' | 'rejected';

type BadgeStyle = { label: string; tone: Tone };

/** One entry per requisition and purchase-order status; a status added to the API fails to compile until it has one. */
export const STATUS_BADGES: Record<AnyStatus, BadgeStyle> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'pending' },
  APPROVED: { label: 'Approved', tone: 'accent' },
  REJECTED: { label: 'Rejected', tone: 'rejected' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  ISSUED: { label: 'Issued', tone: 'neutral' },
  PARTIALLY_RECEIVED: { label: 'Partially received', tone: 'pending' },
  FULLY_RECEIVED: { label: 'Fully received', tone: 'accent' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export function statusLabel(status: AnyStatus): string {
  return STATUS_BADGES[status].label;
}

const TONES: Record<
  Tone,
  (p: Palette) => { background: string; text: string }
> = {
  neutral: (p) => ({ background: p.controlTrack, text: p.muted }),
  pending: (p) => ({ background: p.pendingTint, text: p.pending }),
  accent: (p) => ({ background: p.accentTint, text: p.accent }),
  rejected: (p) => ({ background: p.rejectedTint, text: p.rejected }),
};

export function StatusBadge(props: { status: AnyStatus }) {
  const { label, tone } = STATUS_BADGES[props.status];
  const c = TONES[tone](theme.palette);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: theme.radius.badge,
        backgroundColor: c.background,
      }}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: c.text }}>
        {label}
      </Text>
    </View>
  );
}
