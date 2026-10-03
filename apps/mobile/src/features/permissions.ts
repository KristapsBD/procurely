import type { Role } from '@procurely/shared-types';

// Mirrors the row-level security policies, so the app offers only the actions the database
// will accept. The database still decides: hiding a button is a convenience, not the guard.

/** Buyers and admins manage suppliers and catalog items; everyone else reads them. */
export function canManagePurchasing(role: Role): boolean {
  return role === 'BUYER' || role === 'ADMIN';
}

/** Only admins manage cost centers. */
export function canManageCostCenters(role: Role): boolean {
  return role === 'ADMIN';
}
