import {
  COMPANY_HEADER,
  type CatalogItem,
  type CompanyMembership,
  type CostCenter,
  type CreateCatalogItemRequest,
  type CreateCostCenterRequest,
  type CreateSupplierRequest,
  type DevLoginRequest,
  type MeResponse,
  type SessionResponse,
  type Supplier,
  type UpdateCatalogItemRequest,
  type UpdateCostCenterRequest,
  type UpdateSupplierRequest,
} from '@procurely/shared-types';

/**
 * Everything the app asks of the API. Screens depend on this, so tests can fake it. The company
 * is an argument of every company-scoped call, never ambient state, so a request cannot act in
 * another company.
 */
export interface Api {
  devLogin(personId: string): Promise<SessionResponse>;
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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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
  async function request<T>(path: string, opts: RequestOptions = {}) {
    const method = opts.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.companyId) headers[COMPANY_HEADER] = opts.companyId;
    const response = await fetchFn(`${baseUrl.replace(/\/+$/, '')}${path}`, {
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
  const patch = scoped('PATCH');
  const del = scoped('DELETE');

  return {
    devLogin: (personId) =>
      request<SessionResponse>('/auth/dev-login', {
        method: 'POST',
        body: { personId } satisfies DevLoginRequest,
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
  };
}
