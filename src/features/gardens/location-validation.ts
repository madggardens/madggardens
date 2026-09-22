export type GardenCoordinates = [longitude: number, latitude: number];

// Fast client-side guard derived from the versioned municipal geometry. The server performs the
// authoritative polygon and 25 m checks, because this bounding box intentionally over-approximates.
const madridMunicipalityBounds = {
  minLongitude: -3.888874,
  minLatitude: 40.312284,
  maxLongitude: -3.518113,
  maxLatitude: 40.643275,
};

export function isWithinMadridBoundingBox([longitude, latitude]: GardenCoordinates) {
  return (
    longitude >= madridMunicipalityBounds.minLongitude &&
    longitude <= madridMunicipalityBounds.maxLongitude &&
    latitude >= madridMunicipalityBounds.minLatitude &&
    latitude <= madridMunicipalityBounds.maxLatitude
  );
}
