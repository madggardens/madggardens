import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { GardenDetail, GardenStatus } from '../../../shared/contracts/gardens';
import { deleteGarden, getGarden, signGardenUpload, updateGarden } from '../../api/client';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useOnlineStatus } from '../connectivity/useOnlineStatus';
import { mapAttribution, mapTileUrl } from '../map/map-config';
import { isWithinMadridBoundingBox } from './location-validation';

type Coordinates = [longitude: number, latitude: number];

function LocationEditor({
  value,
  onChange,
}: {
  value: Coordinates;
  onChange: (value: Coordinates) => void;
}) {
  useMapEvents({ click: (event) => onChange([event.latlng.lng, event.latlng.lat]) });
  return <Marker position={[value[1], value[0]]} />;
}

function EditGardenForm({ garden, accessToken }: { garden: GardenDetail; accessToken: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [name, setName] = useState(garden.name);
  const [description, setDescription] = useState(garden.description ?? '');
  const [status, setStatus] = useState<GardenStatus>(garden.status);
  const [location, setLocation] = useState<Coordinates>(garden.location.coordinates);
  const [replacementFiles, setReplacementFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const locationFieldRef = useRef<HTMLFieldSetElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function showError(message: string, target?: HTMLElement | null) {
    setError(message);
    requestAnimationFrame(() => (target ?? errorRef.current)?.focus());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isOnline) {
      showError('Recupera la conexión antes de guardar los cambios.');
      return;
    }
    if (!name.trim()) {
      showError('Introduce un nombre para el jardín.', nameInputRef.current);
      return;
    }
    if (!isWithinMadridBoundingBox(location)) {
      showError(
        'El punto está fuera del área aproximada de Madrid. Selecciona otra ubicación.',
        locationFieldRef.current,
      );
      return;
    }
    setIsSaving(true);
    try {
      if (
        replacementFiles.some(
          (file) =>
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            file.size > 10 * 1024 * 1024,
        )
      ) {
        showError(
          'Las fotografías deben ser JPEG, PNG o WebP y ocupar como máximo 10 MiB.',
          fileInputRef.current,
        );
        return;
      }
      if (replacementFiles.length > 5) {
        showError('Puedes seleccionar un máximo de 5 fotografías.', fileInputRef.current);
        return;
      }

      const photoIds: string[] = [];
      for (const file of replacementFiles) {
        const reservation = await signGardenUpload(
          {
            fileName: file.name,
            mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
            sizeBytes: file.size,
          },
          accessToken,
        );
        const uploaded = await supabase.storage
          .from('garden-originals')
          .uploadToSignedUrl(reservation.data.path, reservation.data.token, file, {
            contentType: file.type,
          });
        if (uploaded.error) throw uploaded.error;
        photoIds.push(reservation.data.photoId);
      }

      await updateGarden(
        garden.id,
        {
          name,
          description: description.trim() || null,
          status,
          location: { type: 'Point', coordinates: location },
          ...(photoIds.length > 0 ? { photoIds } : {}),
        },
        accessToken,
      );
      await queryClient.invalidateQueries({ queryKey: ['garden', garden.id] });
      await queryClient.invalidateQueries({ queryKey: ['my-gardens'] });
      navigate(`/gardens/${garden.id}`, { replace: true });
    } catch (saveError) {
      showError(
        saveError instanceof Error ? saveError.message : 'No se han podido guardar los cambios.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('¿Quieres eliminar esta propuesta? Esta acción la ocultará del mapa.'))
      return;
    if (!isOnline) {
      showError('Recupera la conexión antes de eliminar la propuesta.');
      return;
    }
    setError(null);
    setIsDeleting(true);
    try {
      await deleteGarden(garden.id, accessToken);
      await queryClient.invalidateQueries({ queryKey: ['my-gardens'] });
      navigate('/cuenta', { replace: true });
    } catch (deleteError) {
      showError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No se ha podido eliminar la propuesta.',
      );
      setIsDeleting(false);
    }
  }

  return (
    <form className="mt-8 space-y-6" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <label className="block">
        <span className="text-sm font-medium">Nombre</span>
        <input
          className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          ref={nameInputRef}
          required
          value={name}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Descripción</span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3"
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Estado actual</span>
        <select
          className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3"
          onChange={(event) => setStatus(event.target.value as GardenStatus)}
          value={status}
        >
          <option value="vacio">Vacío</option>
          <option value="en_proceso">En proceso</option>
          <option value="plantado">Plantado</option>
          <option value="exuberante">Exuberante</option>
        </select>
      </label>
      <fieldset ref={locationFieldRef} tabIndex={-1}>
        <legend className="text-sm font-medium">Ubicación</legend>
        <p className="mt-1 text-sm text-stone-400">
          Haz clic para cambiarla. Se volverán a comprobar el municipio y la distancia mínima.
        </p>
        <div
          aria-label="Cambiar ubicación del jardín"
          className="mt-3 h-80 overflow-hidden rounded-2xl border border-stone-700"
          role="region"
        >
          <MapContainer
            center={[location[1], location[0]]}
            className="h-full w-full"
            scrollWheelZoom
            zoom={15}
          >
            <TileLayer attribution={mapAttribution} url={mapTileUrl} />
            <LocationEditor onChange={setLocation} value={location} />
          </MapContainer>
        </div>
        <p
          className={`mt-2 text-sm ${isWithinMadridBoundingBox(location) ? 'text-lime-300' : 'text-amber-300'}`}
          role="status"
        >
          {isWithinMadridBoundingBox(location)
            ? 'Ubicación dentro del área aproximada de Madrid.'
            : 'Ubicación fuera del área aproximada de Madrid.'}
        </p>
      </fieldset>
      <label className="block">
        <span className="text-sm font-medium">Sustituir fotografías (opcional)</span>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="mt-2 block w-full text-sm"
          multiple
          onChange={(event) => setReplacementFiles(Array.from(event.target.files ?? []))}
          ref={fileInputRef}
          type="file"
        />
        <span className="mt-2 block text-xs text-stone-400">
          Si seleccionas archivos, reemplazarán todas las fotografías actuales. Máximo 5 archivos de
          10 MiB.
        </span>
        {replacementFiles.length > 0 && (
          <span className="mt-2 block text-sm text-lime-300" role="status">
            {replacementFiles.length}{' '}
            {replacementFiles.length === 1
              ? 'fotografía seleccionada'
              : 'fotografías seleccionadas'}
            .
          </span>
        )}
      </label>
      <p className="rounded-xl border border-amber-900/70 bg-amber-950/30 p-4 text-sm text-amber-200">
        Al guardar, la propuesta volverá a estar pendiente de revisión y sus fotografías dejarán de
        ser públicas hasta una nueva aprobación.
      </p>
      {error && (
        <p
          className="rounded-xl border border-red-900 bg-red-950/60 p-4 text-red-200"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-lime-400 px-6 py-3 font-semibold text-stone-950 disabled:opacity-50"
          disabled={isSaving || isDeleting || !isOnline}
          type="submit"
        >
          {isSaving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          className="rounded-xl border border-red-900 px-6 py-3 font-semibold text-red-300 disabled:opacity-50"
          disabled={isSaving || isDeleting || !isOnline}
          onClick={() => void handleDelete()}
          type="button"
        >
          {isDeleting ? 'Eliminando…' : 'Eliminar propuesta'}
        </button>
      </div>
    </form>
  );
}

export function EditGardenPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const garden = useQuery({
    queryKey: ['garden', id, session?.access_token],
    queryFn: ({ signal }) => getGarden(id, { accessToken: session!.access_token, signal }),
    enabled: Boolean(session?.access_token),
    retry: false,
  });

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-100">
      <section className="mx-auto max-w-3xl">
        <Link className="text-sm text-lime-400" to={`/gardens/${id}`}>
          ← Volver al jardín
        </Link>
        <h1 className="mt-6 text-4xl font-semibold">Editar propuesta</h1>
        {garden.isPending && (
          <p className="mt-8" role="status">
            Cargando propuesta…
          </p>
        )}
        {garden.isError && (
          <p className="mt-8 text-red-300" role="alert">
            No se ha encontrado la propuesta o no tienes permiso para editarla.
          </p>
        )}
        {garden.data && !garden.data.data.isOwner && (
          <p className="mt-8 text-red-300" role="alert">
            Solo el propietario puede editar esta propuesta.
          </p>
        )}
        {garden.data?.data.isOwner && session && (
          <EditGardenForm accessToken={session.access_token} garden={garden.data.data} />
        )}
      </section>
    </main>
  );
}
