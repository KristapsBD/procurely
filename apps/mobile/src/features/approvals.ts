import type {
  ApprovalRoute,
  ApproverRole,
  Requisition,
} from '@procurely/shared-types';

export function approverRoleLabel(role: ApproverRole): string {
  switch (role) {
    case 'APPROVER':
      return 'Approver';
    case 'ADMIN':
      return 'Admin';
    default: {
      const unhandled: never = role;
      return unhandled;
    }
  }
}

function waitingFor(route: ApprovalRoute): string | null {
  switch (route) {
    case 'APPROVER':
      return 'Waiting for an approver or an admin.';
    case 'ADMIN':
      return 'Waiting for an admin: the total reaches an admin approval rule.';
    case 'NO_RULES':
      return 'The company has no approval rule, so an admin decides.';
    case 'UNDER_THRESHOLD':
      return null;
    default: {
      const unhandled: never = route;
      return unhandled;
    }
  }
}

/** Who decides a requisition, or what was decided and why, as the people involved read it. */
export function approvalNote(
  r: Pick<Requisition, 'status' | 'approvalRoute' | 'decisionNote'>,
): string | null {
  switch (r.status) {
    case 'DRAFT':
    case 'CANCELLED':
      return null;
    case 'SUBMITTED':
      return r.approvalRoute ? waitingFor(r.approvalRoute) : null;
    case 'APPROVED':
      if (r.approvalRoute === 'UNDER_THRESHOLD') return r.decisionNote;
      return r.decisionNote ? `Approver's comment: ${r.decisionNote}` : null;
    case 'REJECTED':
      return `Rejection reason: ${r.decisionNote ?? ''}`;
    default: {
      const unhandled: never = r.status;
      return unhandled;
    }
  }
}
