import { approvalNote } from './approvals';

describe('approvalNote', () => {
  it('says who decides a submitted requisition', () => {
    const submitted = { status: 'SUBMITTED', decisionNote: null } as const;
    expect(approvalNote({ ...submitted, approvalRoute: 'APPROVER' })).toBe(
      'Waiting for an approver or an admin.',
    );
    expect(approvalNote({ ...submitted, approvalRoute: 'ADMIN' })).toBe(
      'Waiting for an admin: the total reaches an admin approval rule.',
    );
    expect(approvalNote({ ...submitted, approvalRoute: 'NO_RULES' })).toBe(
      'The company has no approval rule, so an admin decides.',
    );
  });

  it('shows the API’s reason for an automatic approval as it is', () => {
    const reason = 'Approved automatically: the total is under the threshold.';
    expect(
      approvalNote({
        status: 'APPROVED',
        approvalRoute: 'UNDER_THRESHOLD',
        decisionNote: reason,
      }),
    ).toBe(reason);
  });

  it('shows the approver’s comment, when there is one, and the rejection reason', () => {
    const decided = { approvalRoute: 'APPROVER' } as const;
    expect(
      approvalNote({ ...decided, status: 'APPROVED', decisionNote: 'Fine' }),
    ).toBe("Approver's comment: Fine");
    expect(
      approvalNote({ ...decided, status: 'APPROVED', decisionNote: null }),
    ).toBeNull();
    expect(
      approvalNote({
        ...decided,
        status: 'REJECTED',
        decisionNote: 'Too much',
      }),
    ).toBe('Rejection reason: Too much');
  });

  it('says nothing about a draft or a cancelled requisition', () => {
    for (const status of ['DRAFT', 'CANCELLED'] as const) {
      expect(
        approvalNote({ status, approvalRoute: null, decisionNote: null }),
      ).toBeNull();
    }
  });
});
