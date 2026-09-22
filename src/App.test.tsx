import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { AuthProvider } from './features/auth/AuthProvider';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows that the API is connected after a successful health check', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = url.startsWith('/api/health')
        ? {
            data: {
              status: 'ok',
              service: 'madggardens-api',
              timestamp: '2026-09-20T10:00:00.000Z',
            },
          }
        : { data: [], page: { nextCursor: null } };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderApp();

    expect(screen.getByRole('heading', { name: 'Guerrilla Gardens' })).toBeInTheDocument();
    expect(await screen.findByText('API conectada')).toBeInTheDocument();
  });
});
