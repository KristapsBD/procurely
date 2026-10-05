import {
  DECISION_ACTIONS,
  REQUESTER_ACTIONS,
  type ApprovalRoute,
  type ApproverRole,
  type DecisionAction,
  type RequesterAction,
  type RequisitionAction,
  type RequisitionStatus,
  type Role,
} from '../contract/api.dto';
import { MAX_MINOR_AMOUNT } from '../contract/input';

/** What the lifecycle needs to know of a requisition to decide on an action. */
export interface RequisitionState {
  status: RequisitionStatus;
  requesterPersonId: string;
  costCenterId: string | null;
  justification: string;
  approvalRoute: ApprovalRoute | null;
  lines: readonly { quantity: number }[];
}

export interface ApprovalRuleState {
  thresholdMinor: number;
  requiredRole: ApproverRole;
}

/** Who must decide a requisition of some total, by the company's approval rules. */
export type ApprovalRequirement =
  | { kind: 'rule'; role: ApproverRole }
  | { kind: 'under-threshold' }
  | { kind: 'no-rules' };

/** The person asking, with their role in the company (null without an active membership). */
export interface Actor {
  personId: string;
  role: Role | null;
}

const OUTCOME = { approve: 'APPROVED', reject: 'REJECTED' } as const;

/** The status each action leads to. An action missing from a status is not allowed there. */
const TRANSITIONS: Record<
  RequisitionStatus,
  Partial<
    Record<
      RequisitionAction,
      RequisitionStatus | ((r: ApprovalRequirement) => RequisitionStatus)
    >
  >
> = {
  DRAFT: {
    edit: 'DRAFT',
    submit: (r) => (r.kind === 'under-threshold' ? 'APPROVED' : 'SUBMITTED'),
    cancel: 'CANCELLED',
  },
  SUBMITTED: {
    cancel: 'CANCELLED',
    approve: OUTCOME.approve,
    reject: OUTCOME.reject,
  },
  APPROVED: {},
  REJECTED: {},
  CANCELLED: {},
};

export type Refusal =
  | { reason: 'not-requester' }
  | { reason: 'own-requisition' }
  | { reason: 'not-decider' }
  | { reason: 'not-now'; status: RequisitionStatus; action: RequisitionAction }
  | { reason: 'incomplete'; missing: string[] };

export type Decision =
  { allowed: true; to: RequisitionStatus } | ({ allowed: false } & Refusal);

/**
 * Thresholds are inclusive: a rule of 50000 applies from a total of 50000 on. Of the rules that
 * apply, the one with the greatest threshold decides alone; there is no chain of approvals.
 */
export function approvalRequirement(
  rules: readonly ApprovalRuleState[],
  totalMinor: number,
): ApprovalRequirement {
  if (rules.length === 0) return { kind: 'no-rules' };
  const applicable = rules.filter((r) => r.thresholdMinor <= totalMinor);
  if (applicable.length === 0) return { kind: 'under-threshold' };
  const rule = applicable.reduce((a, b) =>
    b.thresholdMinor > a.thresholdMinor ? b : a,
  );
  return { kind: 'rule', role: rule.requiredRole };
}

/** How a requirement is stored on the requisition, and back. */
export function routeOf(requirement: ApprovalRequirement): ApprovalRoute {
  switch (requirement.kind) {
    case 'rule':
      return requirement.role;
    case 'under-threshold':
      return 'UNDER_THRESHOLD';
    case 'no-rules':
      return 'NO_RULES';
    default: {
      const unhandled: never = requirement;
      throw new Error(`Unhandled requirement ${JSON.stringify(unhandled)}`);
    }
  }
}

export function requirementOf(route: ApprovalRoute): ApprovalRequirement {
  switch (route) {
    case 'APPROVER':
    case 'ADMIN':
      return { kind: 'rule', role: route };
    case 'UNDER_THRESHOLD':
      return { kind: 'under-threshold' };
    case 'NO_RULES':
      return { kind: 'no-rules' };
    default: {
      const unhandled: never = route;
      throw new Error(`Unhandled route ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Whether the actor may approve or reject a requisition with this requirement. Never their own,
 * whatever their role. An approver rule admits approvers and admins, an admin rule and a company
 * without rules only admins. Nobody decides one approved under the threshold.
 */
export function mayDecide(
  requirement: ApprovalRequirement,
  actor: Actor,
  requesterPersonId: string,
):
  | { allowed: true }
  | { allowed: false; reason: 'own-requisition' | 'not-decider' } {
  if (actor.personId === requesterPersonId) {
    return { allowed: false, reason: 'own-requisition' };
  }
  const allowed = (() => {
    switch (requirement.kind) {
      case 'rule':
        return (
          actor.role === 'ADMIN' ||
          (requirement.role === 'APPROVER' && actor.role === 'APPROVER')
        );
      case 'no-rules':
        return actor.role === 'ADMIN';
      case 'under-threshold':
        return false;
      default: {
        const unhandled: never = requirement;
        throw new Error(`Unhandled requirement ${JSON.stringify(unhandled)}`);
      }
    }
  })();
  return allowed
    ? { allowed: true }
    : { allowed: false, reason: 'not-decider' };
}

/** What a draft still lacks before it can be submitted, in words. Empty when complete. */
function missingForSubmit(r: RequisitionState): string[] {
  return [
    r.costCenterId === null && 'a cost center',
    r.justification.trim() === '' && 'a justification',
    r.lines.length === 0 && 'at least one line',
    r.lines.some((l) => l.quantity < 1) && 'a positive quantity on every line',
  ].filter((m): m is string => m !== false);
}

/**
 * Only the requester edits, submits or cancels, an admin included: admins never change someone
 * else's draft. `requirement` is what the company's rules ask of the requisition's total now;
 * it decides where a submit leads.
 */
export function decide(
  r: RequisitionState,
  action: RequesterAction,
  personId: string,
  requirement: ApprovalRequirement,
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
  return { allowed: true, to: typeof to === 'function' ? to(requirement) : to };
}

/** Approve or reject: by the route the requisition was given on submit, never by its requester. */
export function decideApproval(
  r: RequisitionState,
  action: DecisionAction,
  actor: Actor,
):
  | { allowed: true; to: (typeof OUTCOME)[DecisionAction] }
  | ({ allowed: false } & Refusal) {
  if (!TRANSITIONS[r.status][action] || r.approvalRoute === null) {
    return { allowed: false, reason: 'not-now', status: r.status, action };
  }
  const verdict = mayDecide(
    requirementOf(r.approvalRoute),
    actor,
    r.requesterPersonId,
  );
  if (!verdict.allowed) return verdict;
  return { allowed: true, to: OUTCOME[action] };
}

/**
 * The actions to offer the person now. Submit is offered on any own draft, so the refusal can
 * say what an incomplete draft lacks.
 */
export function offeredActions(
  r: RequisitionState,
  actor: Actor,
): RequisitionAction[] {
  const own =
    r.requesterPersonId === actor.personId
      ? REQUESTER_ACTIONS.filter((a) => TRANSITIONS[r.status][a])
      : [];
  const decisions = DECISION_ACTIONS.filter(
    (a) => decideApproval(r, a, actor).allowed,
  );
  return [...own, ...decisions];
}

/** The reason the requester reads when a submit was approved with nobody deciding. */
export function autoApprovalNote(
  totalMinor: number,
  rules: readonly ApprovalRuleState[],
  currency: string,
): string {
  const lowest = Math.min(...rules.map((r) => r.thresholdMinor));
  return (
    `Approved automatically: the total of ${formatMinor(totalMinor, currency)} is under ` +
    `the company's lowest approval threshold of ${formatMinor(lowest, currency)}.`
  );
}

function formatMinor(minor: number, currency: string): string {
  const cents = String(minor % 100).padStart(2, '0');
  return `${Math.floor(minor / 100)}.${cents} ${currency}`;
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
