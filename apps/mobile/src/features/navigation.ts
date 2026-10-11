import type { Role } from '@procurely/shared-types';

export const TAB_ORDER = [
  'inbox',
  'requests',
  'orders',
  'suppliers',
  'company',
] as const;

export type Tab = (typeof TAB_ORDER)[number];

export const ROLE_TABS: Record<Role, readonly Tab[]> = {
  APPROVER: ['inbox', 'company'],
  REQUESTER: ['requests', 'company'],
  BUYER: ['orders', 'suppliers', 'company'],
  ADMIN: TAB_ORDER,
};

export function tabsFor(roles: readonly Role[]): readonly Tab[] {
  const allowed = new Set(roles.flatMap((role) => ROLE_TABS[role]));
  return TAB_ORDER.filter((tab) => allowed.has(tab));
}

export function landingTab(tabs: readonly Tab[]): Tab {
  return tabs[0] ?? 'company';
}
