import type { Requisition, Role } from '@procurely/shared-types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  TestApp,
  catalogItem,
  fakeApi,
  membership,
  pressToWrite,
  requisition,
  supplier,
} from '../test/fakes';
import { ApprovalsScreen } from './approvals-screen';

const ACME = 'company-acme';
const paper = catalogItem(
  supplier(ACME, 'Office Depot'),
  'A4 copy paper',
  2499,
);
const submitted = (title: string, overrides: Partial<Requisition> = {}) =>
  requisition(ACME, title, [{ item: paper, quantity: 3 }], {
    requesterPersonId: 'p-rita',
    requesterName: 'Rita',
    status: 'SUBMITTED',
    approvalRoute: 'APPROVER',
    actions: ['approve', 'reject'],
    ...overrides,
  });

function renderAs(role: Role, rows: Requisition[]) {
  let current = rows;
  const decided = (id: string, change: Partial<Requisition>) => {
    current = current.map((r) =>
      r.id === id ? { ...r, ...change, actions: [] } : r,
    );
    return current.find((r) => r.id === id)!;
  };
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    requisitions: jest.fn(async () => current),
    approveRequisition: jest.fn(async (_t, _c, id, body) =>
      decided(id, { status: 'APPROVED', decisionNote: body.comment ?? null }),
    ),
    rejectRequisition: jest.fn(async (_t, _c, id, body) =>
      decided(id, { status: 'REJECTED', decisionNote: body.reason }),
    ),
  });
  render(
    <TestApp api={api}>
      <ApprovalsScreen />
    </TestApp>,
  );
  return api;
}

const button = (name: string) => screen.findByRole('button', { name });

describe('ApprovalsScreen', () => {
  it('lists only what the API lets the person decide, with who it waits for', async () => {
    renderAs('APPROVER', [
      submitted('Printer paper'),
      submitted('My own paper', {
        requesterPersonId: 'p-alice',
        actions: ['cancel'],
      }),
    ]);
    expect(await screen.findByText('Printer paper')).toBeTruthy();
    expect(screen.getByText('74.97 EUR · requested by Rita')).toBeTruthy();
    expect(
      screen.getByText('Waiting for an approver or an admin.'),
    ).toBeTruthy();
    expect(screen.queryByText('My own paper')).toBeNull();
  });

  it('says when an admin decides because the company has no approval rule', async () => {
    renderAs('ADMIN', [
      submitted('Printer paper', { approvalRoute: 'NO_RULES' }),
    ]);
    expect(
      await screen.findByText(
        'The company has no approval rule, so an admin decides.',
      ),
    ).toBeTruthy();
  });

  it('approves with an optional comment', async () => {
    const api = renderAs('APPROVER', [submitted('Printer paper')]);
    await pressToWrite(await button('Approve Printer paper'));
    expect(api.approveRequisition).toHaveBeenCalledWith(
      'token-alice',
      ACME,
      `${ACME}-req-Printer paper`,
      { comment: undefined },
    );
    expect(await screen.findByText('Approved: Printer paper')).toBeTruthy();
    expect(
      await screen.findByText('Nothing is waiting for your decision.'),
    ).toBeTruthy();
  });

  it('sends the comment when there is one', async () => {
    const api = renderAs('APPROVER', [submitted('Printer paper')]);
    fireEvent.changeText(
      await screen.findByLabelText('Comment on Printer paper (optional)'),
      ' Within budget ',
    );
    await pressToWrite(await button('Approve Printer paper'));
    expect(api.approveRequisition).toHaveBeenCalledWith(
      'token-alice',
      ACME,
      `${ACME}-req-Printer paper`,
      { comment: 'Within budget' },
    );
  });

  it('rejects only with a reason', async () => {
    const api = renderAs('ADMIN', [submitted('Printer paper')]);
    const reject = await button('Reject Printer paper');
    expect(reject.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(
      screen.getByLabelText('Reason for rejecting Printer paper'),
      '   ',
    );
    expect(
      screen.getByRole('button', { name: 'Reject Printer paper' }).props
        .accessibilityState,
    ).toMatchObject({ disabled: true });
    fireEvent.changeText(
      screen.getByLabelText('Reason for rejecting Printer paper'),
      'Use the framework supplier',
    );
    await pressToWrite(
      screen.getByRole('button', { name: 'Reject Printer paper' }),
    );
    expect(api.rejectRequisition).toHaveBeenCalledWith(
      'token-alice',
      ACME,
      `${ACME}-req-Printer paper`,
      { reason: 'Use the framework supplier' },
    );
    expect(await screen.findByText('Rejected: Printer paper')).toBeTruthy();
  });

  it.each(['REQUESTER', 'BUYER'] as const)(
    'shows a %s no inbox and does not ask for requisitions',
    async (role) => {
      const api = renderAs(role, [submitted('Printer paper')]);
      expect(
        await screen.findByText('Approvals are for approvers and admins.'),
      ).toBeTruthy();
      expect(screen.queryByText('Printer paper')).toBeNull();
      expect(api.requisitions).not.toHaveBeenCalled();
    },
  );
});
