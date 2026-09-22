import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { Link, useNavigate } from 'react-router-dom';

import type { GardenStatus } from '../../../shared/contracts/gardens';
import { createGarden, signGardenUpload } from '../../api/client';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useOnlineStatus } from '../connectivity/useOnlineStatus';
import { mapAttribution, mapTileUrl, madridCentre } from '../map/map-config';
import { isWithinMadridBoundingBox } from './location-validation';

type Coordinates = [longitude: number, latitude: number];

function LocationPicker({
  value,
  onChange,
}: {
  value: Coordinates | null;
  onChange: (value: Coordinates) => void;
}) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lng, event.latlng.lat]);
    },
  });

  return value ? <Marker position={[value[1], value[0]]} /> : null;
}

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function CreateGardenPage() {
  const { session } = useAuth();
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<GardenStatus>('vacio');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const locationFieldRef = useRef<HTMLFieldSetElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const preparedSubmission = useRef<{
    signature: string;
    photoIds: string[];
    idempotencyKey: string;
  } | null>(null);

  function showError(message: string, target?: HTMLElement | null) {
    setError(message);
    requestAnimationFrame(() => (target ?? errorRef.current)?.focus());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isOnline) {
      showError('Recupera la conexión antes de enviar la propuesta.');
      return;
    }
    if (!name.trim()) {
      showError('Introduce un nombre para el jardín.', nameInputRef.current);
      return;
    }
    if (!session || !location) {
      showError('Selecciona una ubicación en el mapa.', locationFieldRef.current);
      return;
    }
    if (!isWithinMadridBoundingBox(location)) {
      showError(
        'El punto está fuera del área aproximada de Madrid. Selecciona otra ubicación.',
        locationFieldRef.current,
      );
      return;
    }
    if (files.length < 1 || files.length > 5) {
      showError('Selecciona entre 1 y 5 fotografías.', fileInputRef.current);
      return;
    }
    if (files.some((file) => !acceptedTypes.includes(file.type) || file.size > 10 * 1024 * 1024)) {
      showError(
        'Las fotografías deben ser JPEG, PNG o WebP y ocupar como máximo 10 MiB.',
        fileInputRef.current,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const submissionSignature = JSON.stringify({
        name,
        description,
        status,
        location,
        files: files.map(({ name: fileName, size, type, lastModified }) => ({
          fileName,
          size,
          type,
          lastModified,
        })),
      });
      let prepared = preparedSubmission.current;

      if (!prepared || prepared.signature !== submissionSignature) {
        const photoIds: string[] = [];
        for (const file of files) {
          const reservation = await signGardenUpload(
            {
              fileName: file.name,
              mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
              sizeBytes: file.size,
            },
            session.access_token,
          );
          const { error: uploadError } = await supabase.storage
            .from('garden-originals')
            .uploadToSignedUrl(reservation.data.path, reservation.data.token, file, {
              contentType: file.type,
            });
          if (uploadError) throw uploadError;
          photoIds.push(reservation.data.photoId);
        }
        prepared = {
          signature: submissionSignature,
          photoIds,
          idempotencyKey: crypto.randomUUID(),
        };
        preparedSubmission.current = prepared;
      }

      const result = await createGarden(
        {
          name,
          description: description.trim() || null,
          location: { type: 'Point', coordinates: location },
          status,
          photoIds: prepared.photoIds,
        },
        session.access_token,
        prepared.idempotencyKey,
      );
      navigate(`/gardens/${result.data.id}`, { replace: true });
    } catch (submissionError) {
      showError(
        submissionError instanceof Error
          ? submissionError.message
          : 'No se ha podido crear la propuesta.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-100">
      <section className="mx-auto max-w-3xl">
        <Link className="text-sm text-lime-400 hover:text-lime-300" to="/">
          ← Volver al mapa
        </Link>
        <h1 className="mt-6 text-4xl font-semibold">Proponer un jardín</h1>
        <p className="mt-3 text-stone-400">
          La propuesta será privada hasta que un administrador la apruebe.
        </p>

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
            <span className="text-sm font-medium">Descripción (opcional)</span>
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
              Haz clic en el punto exacto. El servidor comprobará que esté en Madrid y a más de 25 m
              de otro jardín.
            </p>
            <div
              aria-label="Seleccionar ubicación del jardín"
              className="mt-3 h-80 overflow-hidden rounded-2xl border border-stone-700"
              role="region"
            >
              <MapContainer
                center={madridCentre}
                className="h-full w-full"
                scrollWheelZoom
                zoom={12}
              >
                <TileLayer attribution={mapAttribution} url={mapTileUrl} />
                <LocationPicker onChange={setLocation} value={location} />
              </MapContainer>
            </div>
            {location && (
              <p
                className={`mt-2 text-sm ${isWithinMadridBoundingBox(location) ? 'text-lime-300' : 'text-amber-300'}`}
                role="status"
              >
                {isWithinMadridBoundingBox(location)
                  ? 'Ubicación dentro del área aproximada de Madrid.'
                  : 'Ubicación fuera del área aproximada de Madrid.'}{' '}
                <span className="text-xs text-stone-400">
                  {location[1].toFixed(6)}, {location[0].toFixed(6)}
                </span>
              </p>
            )}
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium">Fotografías (1–5)</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              ref={fileInputRef}
              required
              type="file"
            />
            <span className="mt-2 block text-xs text-stone-400">
              JPEG, PNG o WebP; máximo 10 MiB por archivo.
            </span>
            {files.length > 0 && (
              <span className="mt-2 block text-sm text-lime-300" role="status">
                {files.length}{' '}
                {files.length === 1 ? 'fotografía seleccionada' : 'fotografías seleccionadas'}.
              </span>
            )}
          </label>

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
          <button
            className="rounded-xl bg-lime-400 px-6 py-3 font-semibold text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting || !isOnline}
            type="submit"
          >
            {isSubmitting ? 'Enviando propuesta…' : 'Enviar propuesta'}
          </button>
        </form>
      </section>
    </main>
  );
}
