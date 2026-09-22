import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './useAuth';

export function RequireAuth({ children }: PropsWithChildren) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-950 text-stone-300">
        <p role="status">Recuperando sesión…</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/acceso" replace state={{ from: location.pathname }} />;
  }

  return children;
}
