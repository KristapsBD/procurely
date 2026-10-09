import {
  COMPANY_HEADER,
  type ApprovalRule,
  type ApproveRequisitionRequest,
  type AuthOptions,
  type CatalogItem,
  type CompanyMembership,
  type CostCenter,
  type CreateApprovalRuleRequest,
  type CreateCatalogItemRequest,
  type CreateCostCenterRequest,
  type CreateSupplierRequest,
  type DevLoginRequest,
  type GoogleSessionRequest,
  type InviteMemberRequest,
  type MeResponse,
  type Member,
  type RejectRequisitionRequest,
  type Requisition,
  type SaveRequisitionRequest,
  type SessionResponse,
  type Supplier,
  type UpdateCatalogItemRequest,
  type UpdateCostCenterRequest,
  type UpdateMemberRequest,
  type UpdateSupplierRequest,
} from '@procurely/shared-types';

/**
 * Everything the app asks of the API. Screens depend on this, so tests can fake it. The company
 * is an argument of every company-scoped call, never ambient state, so a request cannot act in
 * another company.
 */
export interface Api {
  authOptions(): Promise<AuthOptions>;
  devLogin(personId: string): Promise<SessionResponse>;
  /** Where the browser starts a Google sign-in; the API sends it on to Google. */
  googleStartUrl(returnUrl: string, codeChallenge: string): string;
  /** Redeems the code the browser came back with, using the verifier only this app holds. */
  googleSession(code: string, codeVerifier: string): Promise<SessionResponse>;
  me(token: string): Promise<MeResponse>;
  companies(token: string): Promise<CompanyMembership[]>;
  costCenters(token: string, companyId: string): Promise<CostCenter[]>;
  createCostCenter(
    token: string,
    companyId: string,
    body: CreateCostCenterRequest,
  ): Promise<CostCenter>;
  renameCostCenter(
    token: string,
    companyId: string,
    id: string,
    body: UpdateCostCenterRequest,
  ): Promise<CostCenter>;
  deleteCostCenter(token: string, companyId: string, id: string): Promise<void>;
  /** `selectable` lists only the suppliers that may be chosen for new work (active ones). */
  suppliers(
    token: string,
    companyId: string,
    opts?: { selectable?: boolean },
  ): Promise<Supplier[]>;
  createSupplier(
    token: string,
    companyId: string,
    body: CreateSupplierRequest,
  ): Promise<Supplier>;
  updateSupplier(
    token: string,
    companyId: string,
    id: string,
    body: UpdateSupplierRequest,
  ): Promise<Supplier>;
  catalogItems(token: string, companyId: string): Promise<CatalogItem[]>;
  createCatalogItem(
    token: string,
    companyId: string,
    body: CreateCatalogItemRequest,
  ): Promise<CatalogItem>;
  updateCatalogItem(
    token: string,
    companyId: string,
    id: string,
    body: UpdateCatalogItemRequest,
  ): Promise<CatalogItem>;
  deleteCatalogItem(
    token: string,
    companyId: string,
    id: string,
  ): Promise<void>;
  /** The person's own requisitions; an admin gets every one of the company. */
  requisitions(token: string, companyId: string): Promise<Requisition[]>;
  createRequisition(
    token: string,
    companyId: string,
    body: SaveRequisitionRequest,
  ): Promise<Requisition>;
  /** Replaces a draft's cost center, justification and lines. */
  updateRequisition(
    token: string,
    companyId: string,
    id: string,
    body: SaveRequisitionRequest,
  ): Promise<Requisition>;
  submitRequisition(
    token: string,
    companyId: string,
    id: string,
  ): Promise<Requisition>;
  cancelRequisition(
    token: string,
    companyId: string,
    id: string,
  ): Promise<Requisition>;
  /** Someone else's submitted requisition, by an approver or admin its route admits. */
  approveRequisition(
    token: string,
    companyId: string,
    id: string,
    body: ApproveRequisitionRequest,
  ): Promise<Requisition>;
  /** Like approve; the reason is required and shown to the requester. */
  rejectRequisition(
    token: string,
    companyId: string,
    id: string,
    body: RejectRequisitionRequest,
  ): Promise<Requisition>;
  /** Lowest threshold first. Every member reads them; only admins change them. */
  approvalRules(token: string, companyId: string): Promise<ApprovalRule[]>;
  createApprovalRule(
    token: string,
    companyId: string,
    body: CreateApprovalRuleRequest,
  ): Promise<ApprovalRule>;
  deleteApprovalRule(
    token: string,
    companyId: string,
    id: string,
  ): Promise<void>;
  /** Admins see the whole roster. Anyone else sees at most their own membership. */
  members(token: string, companyId: string): Promise<Member[]>;
  inviteMember(
    token: string,
    companyId: string,
    body: InviteMemberRequest,
  ): Promise<Member>;
  updateMember(
    token: string,
    companyId: string,
    id: string,
    body: UpdateMemberRequest,
  ): Promise<Member>;
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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  companyId?: string;
  body?: unknown;
}

/** The API's own explanation of a refusal (`{ message }`), when it gave one. */
async function serverMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : null;
  } catch {
    return null;
  }
}

export function createApi(baseUrl: string, fetchFn: typeof fetch = fetch): Api {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, opts: RequestOptions = {}) {
    const method = opts.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.companyId) headers[COMPANY_HEADER] = opts.companyId;
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!response.ok) {
      const message = await serverMessage(response);
      throw new ApiError(
        response.status,
        message ?? `${method} ${path} failed with ${response.status}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** A company-scoped call. */
  const scoped =
    (method: RequestOptions['method']) =>
    <T>(token: string, companyId: string, path: string, body?: unknown) =>
      request<T>(path, { method, token, companyId, body });
  const get = scoped('GET');
  const post = scoped('POST');
  const put = scoped('PUT');
  const patch = scoped('PATCH');
  const del = scoped('DELETE');

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
    costCenters: (token, companyId) => get(token, companyId, '/cost-centers'),
    createCostCenter: (token, companyId, body) =>
      post(token, companyId, '/cost-centers', body),
    renameCostCenter: (token, companyId, id, body) =>
      patch(token, companyId, `/cost-centers/${id}`, body),
    deleteCostCenter: (token, companyId, id) =>
      del(token, companyId, `/cost-centers/${id}`),
    suppliers: (token, companyId, opts = {}) =>
      get(
        token,
        companyId,
        opts.selectable ? '/suppliers?selectable=true' : '/suppliers',
      ),
    createSupplier: (token, companyId, body) =>
      post(token, companyId, '/suppliers', body),
    updateSupplier: (token, companyId, id, body) =>
      patch(token, companyId, `/suppliers/${id}`, body),
    catalogItems: (token, companyId) => get(token, companyId, '/catalog-items'),
    createCatalogItem: (token, companyId, body) =>
      post(token, companyId, '/catalog-items', body),
    updateCatalogItem: (token, companyId, id, body) =>
      patch(token, companyId, `/catalog-items/${id}`, body),
    deleteCatalogItem: (token, companyId, id) =>
      del(token, companyId, `/catalog-items/${id}`),
    requisitions: (token, companyId) => get(token, companyId, '/requisitions'),
    createRequisition: (token, companyId, body) =>
      post(token, companyId, '/requisitions', body),
    updateRequisition: (token, companyId, id, body) =>
      put(token, companyId, `/requisitions/${id}`, body),
    submitRequisition: (token, companyId, id) =>
      post(token, companyId, `/requisitions/${id}/submit`),
    cancelRequisition: (token, companyId, id) =>
      post(token, companyId, `/requisitions/${id}/cancel`),
    approveRequisition: (token, companyId, id, body) =>
      post(token, companyId, `/requisitions/${id}/approve`, body),
    rejectRequisition: (token, companyId, id, body) =>
      post(token, companyId, `/requisitions/${id}/reject`, body),
    approvalRules: (token, companyId) =>
      get(token, companyId, '/approval-rules'),
    createApprovalRule: (token, companyId, body) =>
      post(token, companyId, '/approval-rules', body),
    deleteApprovalRule: (token, companyId, id) =>
      del(token, companyId, `/approval-rules/${id}`),
    members: (token, companyId) => get(token, companyId, '/members'),
    inviteMember: (token, companyId, body) =>
      post(token, companyId, '/members', body),
    updateMember: (token, companyId, id, body) =>
      patch(token, companyId, `/members/${id}`, body),
  };
}
