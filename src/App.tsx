import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

import { healthResponseSchema } from '../shared/contracts/health';
import { RequireAuth } from './features/auth/RequireAuth';
import { useAuth } from './features/auth/useAuth';
import { ConnectivityBanner } from './features/connectivity/ConnectivityBanner';

const AccountPage = lazy(() =>
  import('./features/auth/AccountPage').then((module) => ({ default: module.AccountPage })),
);
const AdminPage = lazy(() =>
  import('./features/admin/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const AuthPage = lazy(() =>
  import('./features/auth/AuthPage').then((module) => ({ default: module.AuthPage })),
);
const CreateGardenPage = lazy(() =>
  import('./features/gardens/CreateGardenPage').then((module) => ({
    default: module.CreateGardenPage,
  })),
);
const EditGardenPage = lazy(() =>
  import('./features/gardens/EditGardenPage').then((module) => ({
    default: module.EditGardenPage,
  })),
);
const GardenDetailPage = lazy(() =>
  import('./features/map/GardenDetailPage').then((module) => ({
    default: module.GardenDetailPage,
  })),
);
const GardenMapPage = lazy(() =>
  import('./features/map/GardenMapPage').then((module) => ({ default: module.GardenMapPage })),
);

async function getHealth() {
  const response = await fetch('/api/health', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return healthResponseSchema.parse(await response.json());
}

function HomePage() {
  const { user, isLoading } = useAuth();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  const status = health.isPending
    ? 'Comprobando API…'
    : health.isError
      ? 'API no disponible'
      : 'API conectada';

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <section className="mx-auto max-w-7xl px-6 pt-12">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-lime-400">
          Madrid · MVP
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">
          Guerrilla Gardens
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-300">
          Descubre los jardines urbanos comunitarios aprobados dentro del municipio de Madrid.
        </p>

        <div
          className="mt-10 inline-flex items-center gap-3 rounded-full border border-stone-700 bg-stone-900 px-4 py-2"
          role="status"
          aria-live="polite"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${health.isSuccess ? 'bg-lime-400' : 'bg-amber-400'}`}
            aria-hidden="true"
          />
          <span className="text-sm text-stone-200">{status}</span>
        </div>

        <nav className="mt-10 flex flex-wrap gap-3" aria-label="Cuenta">
          {!isLoading && user ? (
            <>
              <Link
                className="rounded-xl bg-lime-400 px-5 py-3 font-semibold text-stone-950 hover:bg-lime-300"
                to="/gardens/new"
              >
                Proponer jardín
              </Link>
              <Link
                className="rounded-xl border border-stone-700 px-5 py-3 font-semibold text-stone-100 hover:border-stone-500"
                to="/cuenta"
              >
                Ver mi cuenta
              </Link>
            </>
          ) : (
            <>
              <Link
                className="rounded-xl bg-lime-400 px-5 py-3 font-semibold text-stone-950 hover:bg-lime-300"
                to="/acceso"
              >
                Iniciar sesión
              </Link>
              <Link
                className="rounded-xl border border-stone-700 px-5 py-3 font-semibold text-stone-100 hover:border-stone-500"
                to="/registro"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </section>
      <Suspense
        fallback={
          <p className="px-6 py-12 text-stone-400" role="status">
            Cargando mapa…
          </p>
        }
      >
        <GardenMapPage />
      </Suspense>
    </main>
  );
}

export function App() {
  return (
    <>
      <ConnectivityBanner />
      <Suspense
        fallback={
          <main className="grid min-h-screen place-items-center bg-stone-950 text-stone-300">
            <p role="status">Cargando…</p>
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/acceso" element={<AuthPage mode="login" />} />
          <Route path="/registro" element={<AuthPage mode="register" />} />
          <Route path="/gardens/:id" element={<GardenDetailPage />} />
          <Route
            path="/gardens/:id/edit"
            element={
              <RequireAuth>
                <EditGardenPage />
              </RequireAuth>
            }
          />
          <Route
            path="/gardens/new"
            element={
              <RequireAuth>
                <CreateGardenPage />
              </RequireAuth>
            }
          />
          <Route
            path="/cuenta"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </>
  );
}
