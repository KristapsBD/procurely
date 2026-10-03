import { COMPANY_HEADER } from '@procurely/shared-types';
import { createApi } from './client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('createApi', () => {
  it('names the session and the company on a company-scoped request', async () => {
    const fetchFn = jest.fn(async () => jsonResponse([]));
    await createApi('http://api.test/', fetchFn).costCenters(
      'tok',
      'company-1',
    );

    expect(fetchFn).toHaveBeenCalledWith(
      'http://api.test/cost-centers',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer tok', [COMPANY_HEADER]: 'company-1' },
      }),
    );
  });

  it('posts the person id for the dev login, with no credentials', async () => {
    const fetchFn = jest.fn(async () =>
      jsonResponse({ token: 't', person: { id: 'p', email: 'e', name: 'n' } }),
    );
    await createApi('http://api.test', fetchFn).devLogin('p');

    expect(fetchFn).toHaveBeenCalledWith(
      'http://api.test/auth/dev-login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId: 'p' }),
      }),
    );
  });

  it('turns a failed response into an ApiError carrying the status', async () => {
    const fetchFn = jest.fn(async () => jsonResponse({}, 401));
    await expect(
      createApi('http://api.test', fetchFn).me('tok'),
    ).rejects.toEqual(
      expect.objectContaining({ name: 'ApiError', status: 401 }),
    );
  });
});

describe('createApi writes', () => {
  it('patches a supplier in the named company', async () => {
    const fetchFn = jest.fn(async () => jsonResponse({}));
    await createApi('http://api.test', fetchFn).updateSupplier(
      'tok',
      'company-1',
      'supplier-1',
      { active: false },
    );

    expect(fetchFn).toHaveBeenCalledWith(
      'http://api.test/suppliers/supplier-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok',
          [COMPANY_HEADER]: 'company-1',
        },
        body: JSON.stringify({ active: false }),
      }),
    );
  });

  it('asks only for selectable suppliers when told to', async () => {
    const fetchFn = jest.fn(async () => jsonResponse([]));
    await createApi('http://api.test', fetchFn).suppliers('tok', 'c', {
      selectable: true,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://api.test/suppliers?selectable=true',
      expect.anything(),
    );
  });

  it('accepts an empty 204 response to a delete', async () => {
    const fetchFn = jest.fn(async () => new Response(null, { status: 204 }));
    await expect(
      createApi('http://api.test', fetchFn).deleteCatalogItem('tok', 'c', 'i'),
    ).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledWith(
      'http://api.test/catalog-items/i',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('carries the API’s explanation of a refusal', async () => {
    const fetchFn = jest.fn(async () =>
      jsonResponse({ message: 'Already exists', statusCode: 409 }, 409),
    );
    await expect(
      createApi('http://api.test', fetchFn).createSupplier('tok', 'c', {
        name: 'x',
      }),
    ).rejects.toEqual(
      expect.objectContaining({ status: 409, message: 'Already exists' }),
    );
  });
});
