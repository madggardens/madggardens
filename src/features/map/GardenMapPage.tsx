import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { GardenStatus } from '../../../shared/contracts/gardens';
import { getGarden, getGardens } from '../../api/client';
import { useAuth } from '../auth/useAuth';
import { GardenDetailCard } from './GardenDetailCard';
import { GardenMap } from './GardenMap';
import { initialMadridBounds } from './map-config';
import { useDebouncedValue } from './useDebouncedValue';

type Bounds = [number, number, number, number];

const statusOptions: { value: GardenStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'vacio', label: 'Vacío' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'plantado', label: 'Plantado' },
  { value: 'exuberante', label: 'Exuberante' },
];

function isQueryableBounds([minLongitude, minLatitude, maxLongitude, maxLatitude]: Bounds) {
  return maxLongitude - minLongitude <= 0.5 && maxLatitude - minLatitude <= 0.5;
}

export function GardenMapPage() {
  const { session } = useAuth();
  const [bounds, setBounds] = useState<Bounds>(initialMadridBounds);
  const [status, setStatus] = useState<GardenStatus | ''>('');
  const [selectedGardenId, setSelectedGardenId] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const debouncedBounds = useDebouncedValue(bounds, 350);
  const queryable = isQueryableBounds(debouncedBounds);
  const roundedBounds = useMemo(
    () => debouncedBounds.map((coordinate) => Number(coordinate.toFixed(6))) as Bounds,
    [debouncedBounds],
  );
  const gardens = useQuery({
    queryKey: ['gardens', roundedBounds, status],
    queryFn: ({ signal }) =>
      getGardens({ bounds: roundedBounds, status: status || undefined, signal }),
    enabled: queryable,
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ['garden', selectedGardenId, session?.access_token],
    queryFn: ({ signal }) =>
      getGarden(selectedGardenId!, { accessToken: session?.access_token, signal }),
    enabled: Boolean(selectedGardenId),
    retry: false,
  });

  useEffect(() => {
    if (detail.data && selectedGardenId) detailPanelRef.current?.focus();
  }, [detail.data, selectedGardenId]);

  function closeDetail() {
    setSelectedGardenId(null);
    requestAnimationFrame(() =>
      mapWrapperRef.current?.querySelector<HTMLElement>('.leaflet-container')?.focus(),
    );
  }

  return (
    <section className="mx-auto mt-10 max-w-7xl px-4 pb-8 sm:px-6" aria-labelledby="map-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-400">
            Mapa público
          </p>
          <h2 className="mt-1 text-2xl font-semibold" id="map-title">
            Jardines aprobados
          </h2>
        </div>
        <label className="text-sm text-stone-300">
          Estado
          <select
            className="ml-3 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-stone-100"
            onChange={(event) => setStatus(event.target.value as GardenStatus | '')}
            value={status}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!queryable && (
        <p className="mb-3 rounded-xl border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm text-amber-200">
          Acerca el mapa para consultar un área más pequeña.
        </p>
      )}
      {gardens.isError && (
        <div
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          <span>No se han podido cargar los jardines de esta zona.</span>
          <button
            className="font-semibold underline"
            onClick={() => void gardens.refetch()}
            type="button"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-900 shadow-2xl shadow-black/20 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative min-h-[32rem]" ref={mapWrapperRef}>
          <GardenMap
            gardens={gardens.data?.data ?? []}
            onBoundsChange={setBounds}
            onSelectGarden={setSelectedGardenId}
            selectedGardenId={selectedGardenId}
          />
          {gardens.isFetching && (
            <p
              className="absolute left-3 top-3 z-[500] rounded-full bg-stone-950/90 px-3 py-2 text-xs text-stone-200 shadow"
              role="status"
            >
              Actualizando jardines…
            </p>
          )}
        </div>

        <aside
          aria-busy={detail.isPending}
          aria-label="Detalle del jardín seleccionado"
          aria-live="polite"
          className={`${selectedGardenId ? 'absolute inset-x-0 bottom-0 z-[600] max-h-[70%] overflow-y-auto shadow-2xl lg:static lg:max-h-none' : 'min-h-32'} border-t border-stone-800 bg-stone-950 p-6 lg:min-h-48 lg:border-l lg:border-t-0`}
          ref={detailPanelRef}
          tabIndex={-1}
        >
          {!selectedGardenId && (
            <div className="grid h-full place-items-center text-center text-stone-400">
              <p>Selecciona un marcador para consultar el jardín.</p>
            </div>
          )}
          {selectedGardenId && detail.isPending && <p role="status">Cargando detalle…</p>}
          {selectedGardenId && detail.isError && (
            <p className="text-red-300" role="alert">
              No se ha podido abrir este jardín.
            </p>
          )}
          {selectedGardenId && (
            <button
              aria-label="Cerrar detalle y volver al mapa"
              className="mb-4 rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-200"
              onClick={closeDetail}
              type="button"
            >
              Cerrar
            </button>
          )}
          {detail.data && selectedGardenId && (
            <GardenDetailCard compact garden={detail.data.data} />
          )}
        </aside>
      </div>

      {(gardens.data?.data.length ?? 0) > 0 && (
        <section
          aria-labelledby="map-results-title"
          className="mt-5 rounded-2xl border border-stone-800 bg-stone-900/70 p-4"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-semibold text-stone-100" id="map-results-title">
              Resultados del mapa
            </h3>
            <p className="text-sm text-stone-400">
              {gardens.data!.data.length}{' '}
              {gardens.data!.data.length === 1 ? 'jardín visible' : 'jardines visibles'}
            </p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {gardens.data!.data.map((garden) => (
              <li key={garden.id}>
                <button
                  aria-current={selectedGardenId === garden.id ? 'true' : undefined}
                  className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-left transition hover:border-lime-600 hover:bg-stone-900 aria-[current=true]:border-lime-500 aria-[current=true]:bg-lime-950/40"
                  onClick={() => setSelectedGardenId(garden.id)}
                  type="button"
                >
                  <span className="block font-medium text-stone-100">{garden.name}</span>
                  <span className="mt-1 block text-sm text-stone-400">
                    {statusOptions.find((option) => option.value === garden.status)?.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gardens.data?.data.length === 0 && !gardens.isPending && !gardens.isError && queryable && (
        <p className="mt-4 text-center text-sm text-stone-400">
          No hay jardines aprobados en esta zona con el filtro seleccionado.
        </p>
      )}
    </section>
  );
}
