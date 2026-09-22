import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, getCurrentUser, getGardens } from './client';

describe('API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the access token and validates a successful response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: '10000000-0000-4000-8000-000000000001',
            email: 'madrid@example.test',
            role: 'user',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(getCurrentUser('valid-token')).resolves.toMatchObject({
      data: { email: 'madrid@example.test', role: 'user' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      }),
    );
  });

  it('normalizes the API error contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'AUTH_INVALID',
            message: 'La sesión ha caducado o no es válida.',
            requestId: '30000000-0000-4000-8000-000000000001',
            details: [],
          },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );

    const request = getCurrentUser('expired-token');

    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_INVALID',
      requestId: '30000000-0000-4000-8000-000000000001',
    });
  });

  it('encodes map bounds and filters in the garden listing request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [], page: { nextCursor: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await getGardens({
      bounds: [-3.76, 40.37, -3.64, 40.46],
      status: 'plantado',
      limit: 200,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gardens?bbox=-3.76%2C40.37%2C-3.64%2C40.46&limit=200&status=plantado',
      expect.objectContaining({ signal: undefined }),
    );
  });
});
