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

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const openRow = async (title: string) =>
  fireEvent.press(await button(new RegExp(title)));

describe('ApprovalsScreen', () => {
  it('lists only what the API lets the person decide, with requester, cost center and amount', async () => {
    renderAs('APPROVER', [
      submitted('Printer paper'),
      submitted('My own paper', {
        requesterPersonId: 'p-alice',
        actions: ['cancel'],
      }),
    ]);
    expect(await screen.findByText('Printer paper')).toBeTruthy();
    expect(screen.getByText('Rita')).toBeTruthy();
    expect(screen.getByText('€74.97')).toBeTruthy();
    expect(screen.getByText('1 waiting for you')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Waiting · 1' })).toBeTruthy();
    expect(screen.queryByText('My own paper')).toBeNull();
  });

  it('puts approved and rejected requisitions under Decided, with the badge only', async () => {
    renderAs('APPROVER', [
      submitted('Printer paper'),
      submitted('Webcams', {
        status: 'APPROVED',
        actions: [],
        decisionNote: 'Fine',
      }),
      submitted('Headsets', { status: 'REJECTED', actions: [] }),
    ]);
    expect(await screen.findByText('Printer paper')).toBeTruthy();
    expect(screen.queryByText('Webcams')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Decided' }));
    expect(screen.getByText('Webcams')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('Headsets')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.queryByText('Printer paper')).toBeNull();
  });

  it('hints how the total sits against the rule', async () => {
    const api = fakeApi({
      companies: async () => [membership(ACME, 'Acme Trading', 'APPROVER')],
      approvalRules: async () => [
        {
          id: 'r1',
          companyId: ACME,
          thresholdMinor: 5000,
          requiredRole: 'APPROVER',
        },
      ],
      requisitions: async () => [submitted('Printer paper')],
    });
    render(
      <TestApp api={api}>
        <ApprovalsScreen />
      </TestApp>,
    );
    expect(await screen.findByText('Over €50.00')).toBeTruthy();
  });

  it('opens the decision detail from a whole row, with the rule callout and timeline', async () => {
    const api = fakeApi({
      companies: async () => [membership(ACME, 'Acme Trading', 'APPROVER')],
      approvalRules: async () => [
        {
          id: 'r1',
          companyId: ACME,
          thresholdMinor: 5000,
          requiredRole: 'APPROVER',
        },
      ],
      requisitions: async () => [submitted('Printer paper')],
    });
    render(
      <TestApp api={api}>
        <ApprovalsScreen />
      </TestApp>,
    );
    await openRow('Printer paper');
    expect(
      await screen.findByText('From €50.00 needs Approver; you can decide.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Requested by Rita · no cost center yet'),
    ).toBeTruthy();
    expect(screen.getByText('Drafted')).toBeTruthy();
    expect(screen.getAllByText('Submitted')).toHaveLength(2);
    expect(screen.getByText('Waiting for you')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Inbox' }));
    expect(await screen.findByText('Printer paper')).toBeTruthy();
  });

  it('says when an admin decides because the company has no approval rule', async () => {
    renderAs('ADMIN', [
      submitted('Printer paper', { approvalRoute: 'NO_RULES' }),
    ]);
    await openRow('Printer paper');
    expect(
      await screen.findByText(
        'The company has no approval rule, so an admin decides; you can decide.',
      ),
    ).toBeTruthy();
  });

  it('approves with an optional comment', async () => {
    const api = renderAs('APPROVER', [submitted('Printer paper')]);
    await openRow('Printer paper');
    await pressToWrite(await button('Approve'));
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
    await openRow('Printer paper');
    fireEvent.changeText(
      await screen.findByLabelText('Comment'),
      ' Within budget ',
    );
    await pressToWrite(await button('Approve'));
    expect(api.approveRequisition).toHaveBeenCalledWith(
      'token-alice',
      ACME,
      `${ACME}-req-Printer paper`,
      { comment: 'Within budget' },
    );
  });

  it('rejects only with a comment, which becomes the reason', async () => {
    const api = renderAs('ADMIN', [submitted('Printer paper')]);
    await openRow('Printer paper');
    const reject = await button('Reject');
    expect(reject.props.accessibilityState).toMatchObject({ disabled: true });
    expect(
      screen.getByText(
        'A comment is required to reject. It is optional to approve.',
      ),
    ).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Comment'), '   ');
    expect(
      screen.getByRole('button', { name: 'Reject' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    fireEvent.changeText(
      screen.getByLabelText('Comment'),
      'Use the framework supplier',
    );
    await pressToWrite(screen.getByRole('button', { name: 'Reject' }));
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
