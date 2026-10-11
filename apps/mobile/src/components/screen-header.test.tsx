import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { TestApp, fakeApi, membership, switchCompany } from '../test/fakes';
import { ScreenHeader } from './screen-header';
import { StatusBadge } from './status-badge';

const acme = membership('company-acme', 'Acme Trading', 'REQUESTER');
const nordic = membership('company-nordic', 'Nordic Supplies', 'APPROVER');

function renderHeader(header: ReactElement, companies = [acme, nordic]) {
  return render(
    <TestApp api={fakeApi({ companies: async () => companies })}>
      {header}
    </TestApp>,
  );
}

describe('ScreenHeader', () => {
  it('shows the company chip, the title, the meta and the subtitle', async () => {
    renderHeader(
      <ScreenHeader
        title="Inbox"
        meta="3 waiting for you"
        subtitle="Requests to decide"
        lead={{ kind: 'company' }}
      />,
    );
    expect(await screen.findByText('Acme Trading')).toBeTruthy();
    expect(screen.getByText('· Requester')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Inbox' })).toBeTruthy();
    expect(screen.getByText('3 waiting for you')).toBeTruthy();
    expect(screen.getByText('Requests to decide')).toBeTruthy();
  });

  it('shows the aside next to the title', async () => {
    renderHeader(
      <ScreenHeader
        title="PO-12"
        aside={<StatusBadge status="ISSUED" />}
        lead={{ kind: 'company' }}
      />,
    );
    expect(await screen.findByText('Issued')).toBeTruthy();
  });

  it('shows a back pill instead of the chip and calls onPress', async () => {
    const onPress = jest.fn();
    renderHeader(
      <ScreenHeader
        title="Printer paper"
        lead={{ kind: 'back', label: 'Inbox', onPress }}
      />,
    );
    fireEvent.press(
      await screen.findByRole('button', { name: 'Back to Inbox' }),
    );
    expect(screen.queryByRole('button', { name: 'Switch company' })).toBeNull();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('offers no picker with a single company', async () => {
    renderHeader(<ScreenHeader title="Company" lead={{ kind: 'company' }} />, [
      acme,
    ]);
    await screen.findByText('Acme Trading');
    expect(screen.queryByRole('button', { name: 'Switch company' })).toBeNull();
  });

  it.each([
    ['APPROVER', '/inbox'],
    ['BUYER', '/orders'],
    ['ADMIN', '/inbox'],
    ['REQUESTER', '/requests'],
  ] as const)(
    'switching to a company where the person is %s lands on %s',
    async (role, landing) => {
      renderHeader(
        <ScreenHeader title="Company" lead={{ kind: 'company' }} />,
        [acme, membership('company-next', 'Next Co', role)],
      );
      await screen.findByText('Acme Trading');
      switchCompany('Next Co');
      expect(router.replace).toHaveBeenLastCalledWith(landing);
    },
  );
});
