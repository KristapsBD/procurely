import { ROLE_TABS, TAB_ORDER, landingTab, tabsFor } from './navigation';

describe('role tabs', () => {
  it.each([
    ['APPROVER', ['inbox', 'company'], 'inbox'],
    ['REQUESTER', ['requests', 'company'], 'requests'],
    ['BUYER', ['orders', 'suppliers', 'company'], 'orders'],
    ['ADMIN', ['inbox', 'requests', 'orders', 'suppliers', 'company'], 'inbox'],
  ] as const)('%s has exactly %j and lands on %s', (role, tabs, landing) => {
    expect(tabsFor([role])).toEqual(tabs);
    expect(landingTab(tabsFor([role]))).toBe(landing);
  });

  it('gives everyone the Company tab', () => {
    for (const tabs of Object.values(ROLE_TABS)) {
      expect(tabs).toContain('company');
    }
  });

  it('unites the tabs of several roles in tab order without duplicates', () => {
    expect(tabsFor(['BUYER', 'REQUESTER'])).toEqual([
      'requests',
      'orders',
      'suppliers',
      'company',
    ]);
    expect(tabsFor(['REQUESTER', 'BUYER'])).toEqual(
      tabsFor(['BUYER', 'REQUESTER']),
    );
    expect(tabsFor(['APPROVER', 'APPROVER'])).toEqual(['inbox', 'company']);
  });

  it('keeps every role table in the fixed order', () => {
    for (const tabs of Object.values(ROLE_TABS)) {
      const positions = tabs.map((tab) => TAB_ORDER.indexOf(tab));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
