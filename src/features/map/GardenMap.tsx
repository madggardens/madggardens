import { divIcon } from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

import type { GardenStatus, GardenSummary } from '../../../shared/contracts/gardens';
import { madridCentre, mapAttribution, mapTileUrl } from './map-config';

type Bounds = [number, number, number, number];

const statusClass: Record<GardenStatus, string> = {
  vacio: 'garden-marker--empty',
  en_proceso: 'garden-marker--progress',
  plantado: 'garden-marker--planted',
  exuberante: 'garden-marker--lush',
};

const icons = Object.fromEntries(
  Object.entries(statusClass).map(([status, className]) => [
    status,
    divIcon({
      className: `garden-marker ${className}`,
      html: '<span aria-hidden="true"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
  ]),
) as Record<GardenStatus, ReturnType<typeof divIcon>>;

function ViewportReporter({ onBoundsChange }: { onBoundsChange: (bounds: Bounds) => void }) {
  const map = useMapEvents({
    moveend() {
      const bounds = map.getBounds();
      onBoundsChange([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    },
  });

  useEffect(() => {
    map.fire('moveend');
  }, [map]);

  return null;
}

type GardenMapProps = {
  gardens: GardenSummary[];
  selectedGardenId: string | null;
  onBoundsChange: (bounds: Bounds) => void;
  onSelectGarden: (id: string) => void;
};

export function GardenMap({
  gardens,
  selectedGardenId,
  onBoundsChange,
  onSelectGarden,
}: GardenMapProps) {
  return (
    <div aria-label="Mapa interactivo de jardines aprobados" className="h-full" role="region">
      <MapContainer
        center={madridCentre}
        className="h-full min-h-[32rem] w-full bg-stone-900"
        maxZoom={19}
        minZoom={10}
        scrollWheelZoom
        zoom={13}
      >
        <TileLayer attribution={mapAttribution} maxZoom={19} url={mapTileUrl} />
        <ViewportReporter onBoundsChange={onBoundsChange} />
        <MarkerClusterGroup chunkedLoading>
          {gardens.map((garden) => (
            <Marker
              alt={garden.name}
              eventHandlers={{ click: () => onSelectGarden(garden.id) }}
              icon={icons[garden.status]}
              key={garden.id}
              opacity={selectedGardenId === garden.id ? 1 : 0.88}
              position={[garden.location.coordinates[1], garden.location.coordinates[0]]}
              riseOnHover
              title={garden.name}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
