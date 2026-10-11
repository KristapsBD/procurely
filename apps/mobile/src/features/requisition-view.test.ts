import type { ApprovalRule } from '@procurely/shared-types';
import {
  applicableRule,
  orderProgress,
  ruleCallout,
  ruleHint,
  timelineSteps,
} from './requisition-view';

const rule = (
  thresholdMinor: number,
  requiredRole: ApprovalRule['requiredRole'],
): ApprovalRule => ({
  id: `r-${thresholdMinor}`,
  companyId: 'c',
  thresholdMinor,
  requiredRole,
});
const rules = [rule(50000, 'APPROVER'), rule(500000, 'ADMIN')];

describe('timelineSteps', () => {
  it('shows who a submitted requisition waits for', () => {
    const r = { status: 'SUBMITTED', approvalRoute: 'APPROVER' } as const;
    expect(timelineSteps(r, true).map((s) => s.label)).toEqual([
      'Drafted',
      'Submitted',
      'Waiting for you',
    ]);
    expect(timelineSteps(r, false).at(-1)?.label).toBe(
      'Waiting for a decision',
    );
  });

  it('ends in the decision, marking a rejection', () => {
    expect(
      timelineSteps({ status: 'REJECTED', approvalRoute: 'ADMIN' }, false).at(
        -1,
      ),
    ).toEqual({ label: 'Rejected', state: 'rejected' });
    expect(
      timelineSteps({ status: 'APPROVED', approvalRoute: 'ADMIN' }, false).at(
        -1,
      ),
    ).toEqual({ label: 'Approved', state: 'done' });
  });

  it('skips Submitted for a draft that was cancelled', () => {
    expect(
      timelineSteps({ status: 'CANCELLED', approvalRoute: null }, false).map(
        (s) => s.label,
      ),
    ).toEqual(['Drafted', 'Cancelled']);
    expect(
      timelineSteps({ status: 'CANCELLED', approvalRoute: 'APPROVER' }, false),
    ).toHaveLength(3);
  });
});

describe('approval rule text', () => {
  it('picks the greatest threshold at or below the total', () => {
    expect(applicableRule(rules, 49999)).toBeNull();
    expect(applicableRule(rules, 50000)?.requiredRole).toBe('APPROVER');
    expect(applicableRule(rules, 500000)?.requiredRole).toBe('ADMIN');
  });

  it('hints at, over or without a rule', () => {
    const at = { totalMinor: 50000, approvalRoute: 'APPROVER' } as const;
    expect(ruleHint(at, rules, 'EUR')).toBe('At €500.00');
    expect(ruleHint({ ...at, totalMinor: 50001 }, rules, 'EUR')).toBe(
      'Over €500.00',
    );
    expect(ruleHint({ ...at, totalMinor: 100 }, rules, 'EUR')).toBeNull();
    expect(
      ruleHint({ totalMinor: 100, approvalRoute: 'NO_RULES' }, [], 'EUR'),
    ).toBe('No rule, admin decides');
  });

  it('writes the callout with the threshold and the role', () => {
    expect(
      ruleCallout(
        { totalMinor: 60000, approvalRoute: 'APPROVER' },
        rules,
        'EUR',
        true,
      ),
    ).toBe('From €500.00 needs Approver; you can decide.');
  });
});

describe('orderProgress', () => {
  it('sums received and ordered over the lines', () => {
    expect(
      orderProgress({
        lines: [
          { quantity: 4, receivedQuantity: 3 },
          { quantity: 2, receivedQuantity: 2 },
        ],
      } as never),
    ).toEqual({ received: 5, ordered: 6 });
  });
});
