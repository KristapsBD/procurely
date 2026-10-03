/**
 * Client types for the HTTP API, generated from the API's own contract (apps/api/openapi.json):
 * `paths`, `operations`, `components` and one alias per schema (`Member`, `CostCenter`, ...).
 * Do not hand-write request or response shapes here: change the DTO classes in
 * apps/api/src/contract/api.dto.ts and run `pnpm contract:generate`. CI fails when the committed
 * generated types differ from what the API would generate.
 */
export type * from './generated/api';

/** Request header naming the company the person is acting in. */
export const COMPANY_HEADER = 'x-company-id';

/**
 * Why a Google sign-in did not finish: the `?error=` the API adds to the app's return address.
 * - cancelled: the person cancelled at Google, or Google refused before signing in
 * - rejected: the Google ID token failed verification (for example an unverified email)
 * - unsupported: Google is not authoritative for the account's email (neither Gmail nor Google Workspace)
 * - conflict: the email already belongs to a person linked to another Google account, or to a
 *   person who may not be linked
 * - failed: anything else (Google unreachable, an invalid code)
 */
export const GOOGLE_SIGN_IN_ERRORS = [
  'cancelled',
  'rejected',
  'unsupported',
  'conflict',
  'failed',
] as const;
export type GoogleSignInErrorReason = (typeof GOOGLE_SIGN_IN_ERRORS)[number];
