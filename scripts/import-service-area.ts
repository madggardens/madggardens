import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

const sourceUrl =
  'https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/LIMITES_ADMINISTRATIVOS/Termino_Municipal/TopoJSON/Termino_municipal.json';
const datasetUrl =
  'https://datos.madrid.es/dataset/900012-0-limites-administrativos-mapas/downloads';
const sourceLicense = 'Condiciones de reutilización del Ayuntamiento de Madrid';
const slug = 'madrid-municipio';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'data/madrid-municipality.geojson');
const manifestPath = resolve(projectRoot, 'data/service-area-source.json');
const downloadOnly = process.argv.includes('--download-only');
const acceptSourceChange = process.argv.includes('--accept-source-change');

type SourceManifest = {
  slug: string;
  sourceUrl: string;
  datasetUrl: string;
  license: string;
  retrievedAt: string;
  checksum: string;
  geojsonChecksum: string;
};

function normalizeGeometry(converted: Feature | FeatureCollection): MultiPolygon {
  const features = converted.type === 'FeatureCollection' ? converted.features : [converted];

  if (features.length !== 1 || features[0]?.properties?.TM !== 'Madrid') {
    throw new Error('The official source no longer contains exactly one Madrid feature.');
  }

  const geometry = features[0].geometry;

  const coordinates =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : null;

  if (coordinates) {
    return {
      type: 'MultiPolygon',
      coordinates: coordinates.map((polygon) =>
        polygon.map((ring) => {
          const normalizedRing = ring.map(([longitude, latitude]) => [longitude, latitude]);
          const first = normalizedRing[0];
          const last = normalizedRing.at(-1);

          // The municipal TopoJSON currently omits the repeated closing coordinate.
          if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
            normalizedRing.push([...first]);
          }

          return normalizedRing;
        }),
      ),
    };
  }

  throw new Error(`Expected Polygon or MultiPolygon, received ${geometry.type}.`);
}

function validateCoordinates(geometry: MultiPolygon) {
  let coordinateCount = 0;

  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      if (ring.length < 4) {
        throw new Error('The municipality contains an invalid ring.');
      }

      for (const [longitude, latitude] of ring) {
        coordinateCount += 1;
        if (longitude < -4 || longitude > -3 || latitude < 40 || latitude > 41) {
          throw new Error(`Unexpected coordinate outside Madrid bounds: ${longitude},${latitude}`);
        }
      }
    }
  }

  if (coordinateCount < 100) {
    throw new Error('The municipality geometry is unexpectedly small.');
  }
}

const response = await fetch(sourceUrl, {
  headers: { 'User-Agent': 'madggardens-service-area-import/1.0' },
});

if (!response.ok) {
  throw new Error(`Unable to download Madrid boundary: HTTP ${response.status}.`);
}

const sourceBytes = Buffer.from(await response.arrayBuffer());
const checksum = createHash('sha256').update(sourceBytes).digest('hex');
const formattedChecksum = `sha256:${checksum}`;

let existingManifest: SourceManifest | undefined;
try {
  existingManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as SourceManifest;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

if (existingManifest && existingManifest.checksum !== formattedChecksum && !acceptSourceChange) {
  throw new Error(
    `The official source checksum changed from ${existingManifest.checksum} to ${formattedChecksum}. ` +
      'Review it and rerun with --accept-source-change.',
  );
}
const topology = JSON.parse(sourceBytes.toString('utf8')) as Topology<{
  Termino_municipal: GeometryCollection<Polygon>;
}>;

if (topology.type !== 'Topology' || !topology.objects.Termino_municipal) {
  throw new Error('The downloaded file is not the expected Madrid TopoJSON.');
}

const geometry = normalizeGeometry(feature(topology, topology.objects.Termino_municipal));
validateCoordinates(geometry);

const geojson: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: {
    name: 'Madrid',
    slug,
    source: datasetUrl,
    sourceChecksum: formattedChecksum,
  },
  geometry,
};

const geojsonContents = `${JSON.stringify(geojson, null, 2)}\n`;
const geojsonChecksum = `sha256:${createHash('sha256').update(geojsonContents).digest('hex')}`;
const retrievedAt =
  existingManifest?.checksum === formattedChecksum
    ? existingManifest.retrievedAt
    : new Date().toISOString();
const manifest: SourceManifest = {
  slug,
  sourceUrl,
  datasetUrl,
  license: sourceLicense,
  retrievedAt,
  checksum: formattedChecksum,
  geojsonChecksum,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, geojsonContents, 'utf8');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

if (!downloadOnly) {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const databaseHost = new URL(databaseUrl).hostname;
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: ['127.0.0.1', 'localhost'].includes(databaseHost) ? false : 'require',
  });

  try {
    await sql`
      insert into public.service_areas (
        slug,
        name,
        geom,
        source_url,
        source_checksum,
        source_license,
        source_retrieved_at
      )
      values (
        ${slug},
        ${'Madrid'},
        extensions.st_multi(
          extensions.st_setsrid(
            extensions.st_geomfromgeojson(${JSON.stringify(geometry)}),
            4326
          )
        ),
        ${sourceUrl},
        ${formattedChecksum},
        ${sourceLicense},
        ${retrievedAt}
      )
      on conflict (slug) do update
      set name = excluded.name,
          geom = excluded.geom,
          source_url = excluded.source_url,
          source_checksum = excluded.source_checksum,
          source_license = excluded.source_license,
          source_retrieved_at = excluded.source_retrieved_at
    `;

    const [verification] = await sql<{ valid: boolean; areaSquareKilometers: number }[]>`
      select
        extensions.st_isvalid(geom) as valid,
        round(
          (extensions.st_area(geom::extensions.geography) / 1000000)::numeric,
          2
        )::double precision as "areaSquareKilometers"
      from public.service_areas
      where slug = ${slug}
    `;

    if (!verification?.valid || verification.areaSquareKilometers < 500) {
      throw new Error('Imported municipality failed PostGIS validation.');
    }

    process.stdout.write(
      `Imported Madrid municipality (${verification.areaSquareKilometers} km², sha256:${checksum}).\n`,
    );
  } finally {
    await sql.end();
  }
} else {
  process.stdout.write(`Downloaded Madrid municipality (sha256:${checksum}).\n`);
}
