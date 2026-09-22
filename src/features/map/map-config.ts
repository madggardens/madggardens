const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY?.trim();
const configuredTileUrl = import.meta.env.VITE_MAP_TILE_URL?.trim();

const hasMapTilerConfiguration =
  configuredTileUrl &&
  !configuredTileUrl.startsWith('replace-with-') &&
  mapTilerKey &&
  !mapTilerKey.startsWith('replace-with-');

export const mapTileUrl = hasMapTilerConfiguration
  ? configuredTileUrl.replace('{key}', encodeURIComponent(mapTilerKey))
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const mapAttribution = hasMapTilerConfiguration
  ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const madridCentre: [number, number] = [40.4168, -3.7038];
export const initialMadridBounds: [number, number, number, number] = [-3.76, 40.37, -3.64, 40.46];
