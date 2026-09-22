import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';
import { AuthPage } from './AuthPage';

function renderLogin(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    session: null,
    user: null,
    isLoading: false,
    requestEmailLink: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/acceso']}>
        <Routes>
          <Route path="/acceso" element={<AuthPage mode="login" />} />
          <Route path="/cuenta" element={<h1>Cuenta validada</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  return value;
}

describe('AuthPage', () => {
  it('validates the email before contacting Supabase', async () => {
    const user = userEvent.setup();
    const auth = renderLogin();

    await user.type(screen.getByLabelText('Correo electrónico'), 'correo-invalido');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace por correo' }));

    expect(await screen.findByText('Introduce un correo válido.')).toBeInTheDocument();
    expect(auth.requestEmailLink).not.toHaveBeenCalled();
  });

  it('requests a magic link without creating an unknown login user', async () => {
    const user = userEvent.setup();
    const requestEmailLink = vi.fn().mockResolvedValue(undefined);
    renderLogin({ requestEmailLink });

    await user.type(screen.getByLabelText('Correo electrónico'), 'madrid@example.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace por correo' }));

    expect(requestEmailLink).toHaveBeenCalledWith('madrid@example.test', false);
    expect(await screen.findByText(/Te hemos enviado un enlace/)).toBeInTheDocument();
  });

  it('starts Google OAuth from its dedicated button', async () => {
    const user = userEvent.setup();
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderLogin({ signInWithGoogle });

    await user.click(screen.getByRole('button', { name: 'Continuar con Google' }));

    expect(signInWithGoogle).toHaveBeenCalledOnce();
  });
});
