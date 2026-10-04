import {
  REQUISITION_ACTIONS,
  type RequisitionAction,
  type RequisitionStatus,
} from '../contract/api.dto';
import { MAX_MINOR_AMOUNT } from '../contract/input';

/** What the lifecycle needs to know of a requisition to decide on an action. */
export interface RequisitionState {
  status: RequisitionStatus;
  requesterPersonId: string;
  costCenterId: string | null;
  justification: string;
  lines: readonly { quantity: number }[];
}

/** The status each action leads to. An action missing from a status is not allowed there. */
const TRANSITIONS: Record<
  RequisitionStatus,
  Partial<Record<RequisitionAction, RequisitionStatus>>
> = {
  DRAFT: { edit: 'DRAFT', submit: 'SUBMITTED', cancel: 'CANCELLED' },
  SUBMITTED: { cancel: 'CANCELLED' },
  CANCELLED: {},
};

export type Refusal =
  | { reason: 'not-requester' }
  | { reason: 'not-now'; status: RequisitionStatus; action: RequisitionAction }
  | { reason: 'incomplete'; missing: string[] };

export type Decision =
  { allowed: true; to: RequisitionStatus } | ({ allowed: false } & Refusal);

/** What a draft still lacks before it can be submitted, in words. Empty when complete. */
function missingForSubmit(r: RequisitionState): string[] {
  return [
    r.costCenterId === null && 'a cost center',
    r.justification.trim() === '' && 'a justification',
    r.lines.length === 0 && 'at least one line',
    r.lines.some((l) => l.quantity < 1) && 'a positive quantity on every line',
  ].filter((m): m is string => m !== false);
}

/** Only the requester acts on a requisition, an admin included: admins read others', never change them. */
export function decide(
  r: RequisitionState,
  action: RequisitionAction,
  personId: string,
): Decision {
  if (r.requesterPersonId !== personId) {
    return { allowed: false, reason: 'not-requester' };
  }
  const to = TRANSITIONS[r.status][action];
  if (!to)
    return { allowed: false, reason: 'not-now', status: r.status, action };
  const missing = action === 'submit' ? missingForSubmit(r) : [];
  if (missing.length > 0) {
    return { allowed: false, reason: 'incomplete', missing };
  }
  return { allowed: true, to };
}

/**
 * The actions to offer the person now. Submit is offered on any own draft, so the refusal can
 * say what an incomplete draft lacks.
 */
export function offeredActions(
  r: RequisitionState,
  personId: string,
): RequisitionAction[] {
  if (r.requesterPersonId !== personId) return [];
  return REQUISITION_ACTIONS.filter((a) => TRANSITIONS[r.status][a]);
}

/** quantity times unit price, or null when it would not fit the amount column. */
export function lineAmount(
  quantity: number,
  unitPriceMinor: number,
): number | null {
  const amount = quantity * unitPriceMinor;
  return amount <= MAX_MINOR_AMOUNT ? amount : null;
}

export function totalOf(lines: readonly { amountMinor: number }[]): number {
  return lines.reduce((sum, l) => sum + l.amountMinor, 0);
}
