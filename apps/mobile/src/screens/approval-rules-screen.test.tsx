import type { ApprovalRule, Role } from '@procurely/shared-types';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { TestApp, fakeApi, membership, pressToWrite } from '../test/fakes';
import { ApprovalRulesScreen } from './approval-rules-screen';

const NORDIC = 'company-nordic';
const rule = (thresholdMinor: number, requiredRole: 'APPROVER' | 'ADMIN') => ({
  id: `rule-${thresholdMinor}`,
  companyId: NORDIC,
  thresholdMinor,
  requiredRole,
});

function renderAs(role: Role, initial: ApprovalRule[] = []) {
  let rows = initial;
  const api = fakeApi({
    companies: async () => [
      { ...membership(NORDIC, 'Nordic Supplies', role), currency: 'SEK' },
    ],
    approvalRules: jest.fn(async () => rows),
    createApprovalRule: jest.fn(async (_t, companyId, body) => {
      const created = {
        ...rule(body.thresholdMinor, body.requiredRole),
        companyId,
      };
      rows = [...rows, created];
      return created;
    }),
    deleteApprovalRule: jest.fn(async (_t, _c, id) => {
      rows = rows.filter((r) => r.id !== id);
    }),
  });
  render(
    <TestApp api={api}>
      <ApprovalRulesScreen />
    </TestApp>,
  );
  return api;
}

const button = (name: string) => screen.findByRole('button', { name });

describe('ApprovalRulesScreen', () => {
  it('lists the rules in the company currency', async () => {
    renderAs('ADMIN', [rule(50000, 'APPROVER'), rule(200000, 'ADMIN')]);
    expect(
      await screen.findByText('From 500.00 SEK: Approver approves'),
    ).toBeTruthy();
    expect(screen.getByText('From 2000.00 SEK: Admin approves')).toBeTruthy();
  });

  it('says that an admin decides while there are no rules', async () => {
    renderAs('ADMIN');
    expect(
      await screen.findByText(
        'No approval rules: an admin decides every requisition.',
      ),
    ).toBeTruthy();
  });

  it('adds a rule, storing the threshold in minor units', async () => {
    const api = renderAs('ADMIN');
    fireEvent.press(await button('Add approval rule'));
    fireEvent.changeText(screen.getByLabelText('Threshold (SEK)'), '1 500');
    expect(screen.getByText('Enter an amount like 500.00')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Threshold (SEK)'), '1500,5');
    fireEvent.press(screen.getByRole('button', { name: 'Admin' }));
    await pressToWrite(screen.getByRole('button', { name: 'Save rule' }));
    expect(api.createApprovalRule).toHaveBeenCalledWith('token-alice', NORDIC, {
      thresholdMinor: 150050,
      requiredRole: 'ADMIN',
    });
    expect(
      await screen.findByText('From 1500.50 SEK: Admin approves'),
    ).toBeTruthy();
  });

  it('deletes a rule', async () => {
    const api = renderAs('ADMIN', [rule(50000, 'APPROVER')]);
    await pressToWrite(await button('Delete rule from 500.00 SEK'));
    expect(api.deleteApprovalRule).toHaveBeenCalledWith(
      'token-alice',
      NORDIC,
      'rule-50000',
    );
    await waitFor(() =>
      expect(
        screen.queryByText('From 500.00 SEK: Approver approves'),
      ).toBeNull(),
    );
  });

  it.each(['REQUESTER', 'APPROVER', 'BUYER'] as const)(
    'shows a %s no rules and nothing to change',
    async (role) => {
      const api = renderAs(role, [rule(50000, 'APPROVER')]);
      expect(
        await screen.findByText('Approval rules are for admins.'),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Add approval rule' }),
      ).toBeNull();
      expect(api.approvalRules).not.toHaveBeenCalled();
    },
  );
});
