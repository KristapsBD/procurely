import type {
  ApprovalRule,
  PurchaseOrder,
  Requisition,
} from '@procurely/shared-types';
import { approverRoleLabel } from './approvals';
import { formatMoney } from './money';

export type TimelineStep = {
  label: string;
  /** `current` is where the requisition stands now; `rejected` marks a negative end. */
  state: 'done' | 'current' | 'rejected';
};

/**
 * The steps a requisition went through, derived from its status and route. The API records no
 * timestamps, so a step has a label and a state and nothing else. `canDecide` is whether the
 * viewer is the one it waits for.
 */
export function timelineSteps(
  r: Pick<Requisition, 'status' | 'approvalRoute'>,
  canDecide: boolean,
): TimelineStep[] {
  const drafted: TimelineStep = { label: 'Drafted', state: 'done' };
  const submitted: TimelineStep = { label: 'Submitted', state: 'done' };
  switch (r.status) {
    case 'DRAFT':
      return [{ ...drafted, state: 'current' }];
    case 'SUBMITTED':
      return [
        drafted,
        submitted,
        {
          label: canDecide ? 'Waiting for you' : 'Waiting for a decision',
          state: 'current',
        },
      ];
    case 'APPROVED':
      return [drafted, submitted, { label: 'Approved', state: 'current' }];
    case 'REJECTED':
      return [drafted, submitted, { label: 'Rejected', state: 'rejected' }];
    case 'CANCELLED':
      return [
        drafted,
        ...(r.approvalRoute === null ? [] : [submitted]),
        { label: 'Cancelled', state: 'current' },
      ];
    default: {
      const unhandled: never = r.status;
      return unhandled;
    }
  }
}

/** The rule that decides a total: of those that apply, the greatest threshold. Thresholds are inclusive. */
export function applicableRule(
  rules: readonly ApprovalRule[],
  totalMinor: number,
): ApprovalRule | null {
  const applicable = rules.filter((rule) => rule.thresholdMinor <= totalMinor);
  if (applicable.length === 0) return null;
  return applicable.reduce((a, b) =>
    b.thresholdMinor > a.thresholdMinor ? b : a,
  );
}

/** A few words on how the total sits against the rule that decides it, for a list row. */
export function ruleHint(
  r: Pick<Requisition, 'totalMinor' | 'approvalRoute'>,
  rules: readonly ApprovalRule[],
  currency: string,
): string | null {
  if (r.approvalRoute === 'NO_RULES') return 'No rule, admin decides';
  const rule = applicableRule(rules, r.totalMinor);
  if (!rule) return null;
  const limit = formatMoney(rule.thresholdMinor, currency);
  return r.totalMinor === rule.thresholdMinor ? `At ${limit}` : `Over ${limit}`;
}

/** The sentence under a decision's callout: which rule routed it here. */
export function ruleCallout(
  r: Pick<Requisition, 'totalMinor' | 'approvalRoute'>,
  rules: readonly ApprovalRule[],
  currency: string,
  canDecide: boolean,
): string | null {
  const tail = canDecide ? 'you can decide' : 'you cannot decide';
  if (r.approvalRoute === 'NO_RULES') {
    return `The company has no approval rule, so an admin decides; ${tail}.`;
  }
  const rule = applicableRule(rules, r.totalMinor);
  if (!rule) return null;
  const limit = formatMoney(rule.thresholdMinor, currency);
  return `From ${limit} needs ${approverRoleLabel(rule.requiredRole)}; ${tail}.`;
}

export type OrderProgress = { received: number; ordered: number };

export function orderProgress(
  order: Pick<PurchaseOrder, 'lines'>,
): OrderProgress {
  return {
    received: order.lines.reduce((sum, l) => sum + l.receivedQuantity, 0),
    ordered: order.lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

export function orderOf(
  orders: readonly PurchaseOrder[],
  requisitionId: string,
): PurchaseOrder | null {
  return orders.find((o) => o.requisitionId === requisitionId) ?? null;
}
