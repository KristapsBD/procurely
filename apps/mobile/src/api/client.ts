import {
  COMPANY_HEADER,
  type AuthOptions,
  type CompanyMembership,
  type CostCenter,
  type DevLoginRequest,
  type GoogleSessionRequest,
  type MeResponse,
  type SessionResponse,
} from '@procurely/shared-types';

/** Everything the app asks of the API. Screens depend on this, so tests can fake it. */
export interface Api {
  authOptions(): Promise<AuthOptions>;
  devLogin(personId: string): Promise<SessionResponse>;
  /** Where the browser starts a Google sign-in; the API sends it on to Google. */
  googleStartUrl(returnUrl: string, codeChallenge: string): string;
  /** Redeems the code the browser came back with, using the verifier only this app holds. */
  googleSession(code: string, codeVerifier: string): Promise<SessionResponse>;
  me(token: string): Promise<MeResponse>;
  companies(token: string): Promise<CompanyMembership[]>;
  /** The company is an argument, never ambient state, so a request cannot act in another one. */
  costCenters(token: string, companyId: string): Promise<CostCenter[]>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  token?: string;
  companyId?: string;
  body?: unknown;
}

export function createApi(baseUrl: string, fetchFn: typeof fetch = fetch): Api {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, opts: RequestOptions = {}) {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.companyId) headers[COMPANY_HEADER] = opts.companyId;
    const response = await fetchFn(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `${opts.method ?? 'GET'} ${path} failed with ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  return {
    authOptions: () => request<AuthOptions>('/auth/options'),
    devLogin: (personId) =>
      request<SessionResponse>('/auth/dev-login', {
        method: 'POST',
        body: { personId } satisfies DevLoginRequest,
      }),
    googleStartUrl: (returnUrl, codeChallenge) =>
      `${base}/auth/google/start?return_to=${encodeURIComponent(returnUrl)}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}`,
    googleSession: (code, codeVerifier) =>
      request<SessionResponse>('/auth/google/session', {
        method: 'POST',
        body: { code, codeVerifier } satisfies GoogleSessionRequest,
      }),
    me: (token) => request<MeResponse>('/me', { token }),
    companies: (token) => request<CompanyMembership[]>('/companies', { token }),
    costCenters: (token, companyId) =>
      request<CostCenter[]>('/cost-centers', { token, companyId }),
  };
}
