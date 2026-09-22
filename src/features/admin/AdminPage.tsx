import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { getAdminGardens, moderateGarden } from '../../api/client';
import { useAuth } from '../auth/useAuth';

export function AdminPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gardens = useQuery({
    queryKey: ['admin-gardens', 'pendiente', session?.access_token],
    queryFn: () => getAdminGardens(session!.access_token),
    enabled: Boolean(session?.access_token),
    retry: false,
  });

  async function applyModeration(
    id: string,
    input: { moderation: 'aprobado' } | { moderation: 'rechazado'; rejectionReason: string },
  ) {
    if (!session) return;
    setError(null);
    setActiveId(id);
    try {
      await moderateGarden(id, input, session.access_token);
      await queryClient.invalidateQueries({ queryKey: ['admin-gardens'] });
      await queryClient.invalidateQueries({ queryKey: ['garden', id] });
      await queryClient.invalidateQueries({ queryKey: ['gardens'] });
    } catch (moderationError) {
      setError(
        moderationError instanceof Error
          ? moderationError.message
          : 'No se ha podido moderar la propuesta.',
      );
    } finally {
      setActiveId(null);
    }
  }

  function handleApprove(id: string) {
    if (
      window.confirm('¿Aprobar y publicar esta propuesta? Se procesarán todas sus fotografías.')
    ) {
      void applyModeration(id, { moderation: 'aprobado' });
    }
  }

  function handleReject(id: string) {
    const reason = window.prompt('Motivo del rechazo visible para el propietario:')?.trim();
    if (reason) void applyModeration(id, { moderation: 'rechazado', rejectionReason: reason });
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-100">
      <section className="mx-auto max-w-4xl">
        <Link className="text-sm text-lime-400" to="/cuenta">
          ← Volver a la cuenta
        </Link>
        <h1 className="mt-6 text-4xl font-semibold">Moderación</h1>
        <p className="mt-3 text-stone-400">Propuestas pendientes de revisión y publicación.</p>
        {error && (
          <p
            className="mt-6 rounded-xl border border-red-900 bg-red-950/60 p-4 text-red-200"
            role="alert"
          >
            {error}
          </p>
        )}
        {gardens.isPending && (
          <p className="mt-8" role="status">
            Cargando cola…
          </p>
        )}
        {gardens.isError && (
          <p className="mt-8 text-red-300" role="alert">
            No tienes permisos de administración o la cola no está disponible.
          </p>
        )}
        {gardens.data?.data.length === 0 && (
          <p className="mt-8 rounded-2xl border border-stone-800 bg-stone-900 p-6 text-stone-400">
            No hay propuestas pendientes.
          </p>
        )}
        {gardens.data && gardens.data.data.length > 0 && (
          <ul className="mt-8 space-y-4">
            {gardens.data.data.map((garden) => (
              <li className="rounded-2xl border border-stone-800 bg-stone-900 p-6" key={garden.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{garden.name}</h2>
                    <p className="mt-1 text-sm text-stone-400">
                      Enviada el {new Date(garden.createdAt).toLocaleDateString('es-ES')}
                    </p>
                    <Link
                      className="mt-3 inline-flex text-sm font-semibold text-lime-400"
                      to={`/gardens/${garden.id}`}
                    >
                      Revisar ficha →
                    </Link>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-50"
                      disabled={activeId !== null}
                      onClick={() => handleApprove(garden.id)}
                      type="button"
                    >
                      {activeId === garden.id ? 'Procesando…' : 'Aprobar'}
                    </button>
                    <button
                      className="rounded-xl border border-red-900 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-50"
                      disabled={activeId !== null}
                      onClick={() => handleReject(garden.id)}
                      type="button"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
