import { Link } from 'react-router-dom';

import type { GardenDetail } from '../../../shared/contracts/gardens';

const statusLabels = {
  vacio: 'Vacío',
  en_proceso: 'En proceso',
  plantado: 'Plantado',
  exuberante: 'Exuberante',
} as const;

type GardenDetailCardProps = {
  garden: GardenDetail;
  compact?: boolean;
};

export function GardenDetailCard({ garden, compact = false }: GardenDetailCardProps) {
  return (
    <article>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime-400">
        {statusLabels[garden.status]}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-stone-100">{garden.name}</h2>
      {garden.description && <p className="mt-4 leading-7 text-stone-300">{garden.description}</p>}

      {garden.photos.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {garden.photos.map((photo) => (
            <img
              alt={`Fotografía de ${garden.name}`}
              className="aspect-square w-full rounded-xl object-cover"
              key={photo.id}
              loading="lazy"
              src={photo.thumbnailUrl}
            />
          ))}
        </div>
      )}

      {!compact && garden.isOwner && (
        <Link
          className="mt-6 inline-flex rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-stone-950"
          to={`/gardens/${garden.id}/edit`}
        >
          Editar propuesta
        </Link>
      )}

      {compact && (
        <Link
          className="mt-6 inline-flex text-sm font-semibold text-lime-400 hover:text-lime-300"
          to={`/gardens/${garden.id}`}
        >
          Abrir ficha completa →
        </Link>
      )}
    </article>
  );
}
