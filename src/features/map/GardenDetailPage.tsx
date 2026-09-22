import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { getGarden } from '../../api/client';
import { useAuth } from '../auth/useAuth';
import { GardenDetailCard } from './GardenDetailCard';

export function GardenDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const garden = useQuery({
    queryKey: ['garden', id, session?.access_token],
    queryFn: ({ signal }) => getGarden(id, { accessToken: session?.access_token, signal }),
    retry: false,
  });

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-100">
      <section className="mx-auto max-w-3xl">
        <Link className="text-sm text-lime-400 hover:text-lime-300" to="/">
          ← Volver al mapa
        </Link>
        <div className="mt-6 rounded-3xl border border-stone-800 bg-stone-900 p-7">
          {garden.isPending && <p role="status">Cargando jardín…</p>}
          {garden.isError && (
            <div role="alert">
              <h1 className="text-2xl font-semibold">No se ha encontrado el jardín</h1>
              <p className="mt-3 text-stone-400">
                Puede que no exista o que todavía no sea público.
              </p>
            </div>
          )}
          {garden.data && <GardenDetailCard garden={garden.data.data} />}
        </div>
      </section>
    </main>
  );
}
