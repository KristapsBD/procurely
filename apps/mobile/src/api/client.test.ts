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
