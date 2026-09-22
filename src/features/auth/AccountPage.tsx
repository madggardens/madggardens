import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { deleteAccount, getCurrentUser, getMyGardens } from '../../api/client';
import { supabase } from '../../lib/supabase';
import { useAuth } from './useAuth';

export function AccountPage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState<string>();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const currentUser = useQuery({
    queryKey: ['current-user', session?.access_token],
    queryFn: () => getCurrentUser(session!.access_token),
    enabled: Boolean(session?.access_token),
    retry: false,
  });
  const gardens = useQuery({
    queryKey: ['my-gardens', session?.access_token],
    queryFn: () => getMyGardens(session!.access_token),
    enabled: Boolean(session?.access_token),
    retry: false,
  });

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  async function handleDeleteAccount() {
    if (!session) return;
    const confirmation = window.prompt(
      'Esta acción elimina tu cuenta y tus propuestas privadas. Los jardines aprobados se conservarán sin asociación a tu usuario. Escribe ELIMINAR para continuar.',
    );
    if (confirmation !== 'ELIMINAR') return;

    setDeleteError(undefined);
    setIsDeletingAccount(true);
    try {
      await deleteAccount(session.access_token);
      navigate('/', { replace: true });
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      setDeleteError('No se ha podido eliminar la cuenta. Inténtalo de nuevo.');
      setIsDeletingAccount(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-100">
      <section className="mx-auto max-w-2xl">
        <Link className="text-sm text-lime-400 hover:text-lime-300" to="/">
          ← Volver al inicio
        </Link>
        <h1 className="mt-6 text-4xl font-semibold">Tu cuenta</h1>

        <div className="mt-8 rounded-2xl border border-stone-800 bg-stone-900 p-6">
          {currentUser.isPending && <p role="status">Validando sesión con la API…</p>}
          {currentUser.isError && (
            <p className="text-red-300" role="alert">
              No se ha podido validar la sesión con la API.
            </p>
          )}
          {currentUser.data && (
            <>
              <dl className="grid gap-4 sm:grid-cols-[9rem_1fr]">
                <dt className="text-stone-400">Correo</dt>
                <dd>{currentUser.data.data.email}</dd>
                <dt className="text-stone-400">Rol</dt>
                <dd>{currentUser.data.data.role === 'admin' ? 'Administrador' : 'Usuario'}</dd>
              </dl>
              {currentUser.data.data.role === 'admin' && (
                <Link
                  className="mt-6 inline-flex rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950"
                  to="/admin"
                >
                  Abrir moderación
                </Link>
              )}
            </>
          )}
        </div>

        <section className="mt-10" aria-labelledby="my-gardens-title">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold" id="my-gardens-title">
              Mis propuestas
            </h2>
            <Link
              className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-stone-950"
              to="/gardens/new"
            >
              Nueva propuesta
            </Link>
          </div>
          {gardens.isPending && (
            <p className="mt-5 text-stone-400" role="status">
              Cargando propuestas…
            </p>
          )}
          {gardens.isError && (
            <p className="mt-5 text-red-300" role="alert">
              No se han podido cargar tus propuestas.
            </p>
          )}
          {gardens.data?.data.length === 0 && (
            <p className="mt-5 rounded-2xl border border-stone-800 bg-stone-900 p-6 text-stone-400">
              Todavía no has enviado ninguna propuesta.
            </p>
          )}
          {gardens.data && gardens.data.data.length > 0 && (
            <ul className="mt-5 space-y-3">
              {gardens.data.data.map((garden) => (
                <li
                  className="rounded-2xl border border-stone-800 bg-stone-900 p-5"
                  key={garden.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{garden.name}</h3>
                      <p className="mt-1 text-sm text-stone-400">
                        {garden.moderation === 'pendiente'
                          ? 'Pendiente de revisión'
                          : garden.moderation === 'aprobado'
                            ? 'Aprobada'
                            : 'Rechazada'}
                      </p>
                      {garden.rejectionReason && (
                        <p className="mt-2 text-sm text-red-300">{garden.rejectionReason}</p>
                      )}
                    </div>
                    <Link
                      className="text-sm font-semibold text-lime-400"
                      to={`/gardens/${garden.id}`}
                    >
                      Ver y editar →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          className="mt-6 rounded-xl border border-stone-700 px-4 py-2 text-sm font-medium hover:border-stone-500"
          onClick={() => void handleSignOut()}
          type="button"
        >
          Cerrar sesión
        </button>

        <section
          className="mt-12 border-t border-stone-800 pt-8"
          aria-labelledby="delete-account-title"
        >
          <h2 className="text-xl font-semibold text-red-300" id="delete-account-title">
            Eliminar cuenta
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-400">
            Se eliminarán tus propuestas pendientes o rechazadas y sus fotografías privadas. Los
            jardines ya aprobados seguirán publicados, pero dejarán de estar asociados a tu cuenta.
          </p>
          {deleteError && (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {deleteError}
            </p>
          )}
          <button
            className="mt-5 rounded-xl border border-red-900 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-50"
            disabled={isDeletingAccount}
            onClick={() => void handleDeleteAccount()}
            type="button"
          >
            {isDeletingAccount ? 'Eliminando cuenta…' : 'Eliminar mi cuenta'}
          </button>
        </section>
      </section>
    </main>
  );
}
