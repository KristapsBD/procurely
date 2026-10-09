import type { Member, Role } from '@procurely/shared-types';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../api/client';
import {
  TestApp,
  deferred,
  fakeApi,
  member,
  membership,
  pressToWrite,
} from '../test/fakes';
import { HomeScreen } from './home-screen';
import { MembersScreen } from './members-screen';

const ACME = 'company-acme';
const NORDIC = 'company-nordic';
const ROLE_REFUSAL = 'Not allowed for your role in this company';
const LAST_ADMIN = 'A company needs at least one active admin';

const dave = member(ACME, 'Dave Admin', 'ADMIN');
const alice = member(ACME, 'Alice Requester', 'REQUESTER');
const oscar = member(ACME, 'Oscar Deactivated', 'REQUESTER', false);

function renderMembers(
  role: Role,
  rows: Member[] = [dave, alice, oscar],
  overrides = {},
) {
  let current = rows;
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    members: jest.fn(async () => current),
    inviteMember: jest.fn(async (_t, _c, body) => {
      const created = member(ACME, body.email, body.role);
      current = [...current, created];
      return created;
    }),
    updateMember: jest.fn(async (_t, _c, id, body) => {
      current = current.map((m) => (m.id === id ? { ...m, ...body } : m));
      return current.find((m) => m.id === id)!;
    }),
    ...overrides,
  });
  render(
    <TestApp api={api}>
      <MembersScreen />
    </TestApp>,
  );
  return api;
}

describe('MembersScreen', () => {
  it('shows an admin each member’s role and whether they are active', async () => {
    renderMembers('ADMIN');
    expect(await screen.findByText('Dave Admin')).toBeTruthy();
    expect(screen.getByText('Alice Requester')).toBeTruthy();
    expect(screen.getByText('Role: Admin')).toBeTruthy();
    expect(screen.getAllByText('Role: Requester')).toHaveLength(2);
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(
      screen.getByText(
        'Inviting adds the person right away. No email is sent.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('invites by email and role, and does not send a name', async () => {
    const api = renderMembers('ADMIN');
    fireEvent.press(
      await screen.findByRole('button', { name: 'Invite member' }),
    );
    fireEvent.changeText(screen.getByLabelText('Email'), ' New.Hire@x.test ');
    fireEvent.press(screen.getByRole('button', { name: 'Role Buyer' }));
    await pressToWrite(screen.getByRole('button', { name: 'Invite' }));

    expect(await screen.findByText('New.Hire@x.test')).toBeTruthy();
    expect(api.inviteMember).toHaveBeenCalledWith('token-alice', ACME, {
      email: 'New.Hire@x.test',
      role: 'BUYER',
    });
  });

  it('lets an admin change a role, then deactivate and reactivate', async () => {
    const api = renderMembers('ADMIN');
    fireEvent.press(
      await screen.findByRole('button', {
        name: 'Change role of Alice Requester',
      }),
    );
    await pressToWrite(
      screen.getByRole('button', { name: 'Set Alice Requester to Buyer' }),
    );
    expect(await screen.findByText('Role: Buyer')).toBeTruthy();

    await pressToWrite(
      screen.getByRole('button', { name: 'Deactivate Alice Requester' }),
    );
    await pressToWrite(
      await screen.findByRole('button', {
        name: 'Reactivate Alice Requester',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Deactivate Alice Requester' }),
    ).toBeTruthy();

    expect(api.updateMember).toHaveBeenNthCalledWith(
      1,
      'token-alice',
      ACME,
      alice.id,
      { role: 'BUYER' },
    );
    expect(api.updateMember).toHaveBeenNthCalledWith(
      2,
      'token-alice',
      ACME,
      alice.id,
      { active: false },
    );
    expect(api.updateMember).toHaveBeenNthCalledWith(
      3,
      'token-alice',
      ACME,
      alice.id,
      { active: true },
    );
  });

  it('shows the API refusal and changes nothing when the last admin would be removed', async () => {
    const api = renderMembers('ADMIN', [dave], {
      updateMember: jest.fn(async () => {
        throw new ApiError(409, LAST_ADMIN);
      }),
    });
    await pressToWrite(
      await screen.findByRole('button', { name: 'Deactivate Dave Admin' }),
    );
    expect(await screen.findByText(LAST_ADMIN)).toBeTruthy();
    expect(screen.getByText('Role: Admin')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Deactivate Dave Admin' }),
    ).toBeTruthy();

    fireEvent.press(
      screen.getByRole('button', { name: 'Change role of Dave Admin' }),
    );
    await pressToWrite(
      screen.getByRole('button', { name: 'Set Dave Admin to Buyer' }),
    );
    expect(await screen.findByText(LAST_ADMIN)).toBeTruthy();
    expect(screen.getByText('Role: Admin')).toBeTruthy();
    expect(api.updateMember).toHaveBeenLastCalledWith(
      'token-alice',
      ACME,
      dave.id,
      { role: 'BUYER' },
    );
  });

  it.each(['REQUESTER', 'APPROVER', 'BUYER'] as const)(
    'shows a %s the API refusal and not the roster',
    async (role) => {
      const api = renderMembers(role, [alice, dave]);
      expect(await screen.findByText(ROLE_REFUSAL)).toBeTruthy();
      expect(screen.queryByText('Dave Admin')).toBeNull();
      expect(screen.queryByText('Alice Requester')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Invite member' }),
      ).toBeNull();
      expect(api.members).toHaveBeenCalledWith('token-alice', ACME);
    },
  );

  it('shows the message the API returned when it refuses the list', async () => {
    renderMembers('BUYER', [], {
      members: async () => {
        throw new ApiError(403, 'Not allowed in this company');
      },
    });
    expect(await screen.findByText('Not allowed in this company')).toBeTruthy();
    expect(screen.queryByText(ROLE_REFUSAL)).toBeNull();
  });
});

describe('MembersScreen company switching', () => {
  const frida = member(NORDIC, 'Frida Requester', 'REQUESTER');

  it('never shows the previous company’s members after a switch, even while loading', async () => {
    const nordicRows = deferred<Member[]>();
    const api = fakeApi({
      companies: async () => [
        membership(ACME, 'Acme Trading', 'ADMIN'),
        membership(NORDIC, 'Nordic Supplies', 'ADMIN'),
      ],
      members: jest.fn((_t, companyId) =>
        companyId === ACME ? Promise.resolve([alice]) : nordicRows.promise,
      ),
    });
    render(
      <TestApp api={api}>
        <HomeScreen />
        <MembersScreen />
      </TestApp>,
    );
    expect(await screen.findByText('Alice Requester')).toBeTruthy();
    expect(api.members).toHaveBeenCalledWith('token-alice', ACME);

    fireEvent.press(screen.getByRole('button', { name: 'Nordic Supplies' }));

    expect(screen.queryByText('Alice Requester')).toBeNull();
    expect(screen.getByLabelText('Loading members')).toBeTruthy();

    await act(async () => nordicRows.resolve([frida]));
    expect(await screen.findByText('Frida Requester')).toBeTruthy();
    expect(screen.queryByText('Alice Requester')).toBeNull();
    expect(api.members).toHaveBeenCalledWith('token-alice', NORDIC);
  });

  it('ignores a slow response for a company that is no longer selected', async () => {
    const acmeRows = deferred<Member[]>();
    const nordicRows = deferred<Member[]>();
    const api = fakeApi({
      companies: async () => [
        membership(ACME, 'Acme Trading', 'ADMIN'),
        membership(NORDIC, 'Nordic Supplies', 'ADMIN'),
      ],
      members: jest.fn((_t, companyId) =>
        companyId === ACME ? acmeRows.promise : nordicRows.promise,
      ),
    });
    render(
      <TestApp api={api}>
        <HomeScreen />
        <MembersScreen />
      </TestApp>,
    );
    fireEvent.press(
      await screen.findByRole('button', { name: 'Nordic Supplies' }),
    );

    await act(async () => acmeRows.resolve([alice]));
    expect(screen.queryByText('Alice Requester')).toBeNull();

    await act(async () => nordicRows.resolve([frida]));
    expect(await screen.findByText('Frida Requester')).toBeTruthy();
    expect(screen.queryByText('Alice Requester')).toBeNull();
  });
});
