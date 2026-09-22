import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { parseAdminGardenListQuery, processPhoto } from './admin-moderation';

describe('admin garden list query', () => {
  beforeEach(() => {
    process.env.CURSOR_SIGNING_SECRET = 'test-cursor-secret-with-at-least-32-characters';
  });

  it('defaults to the pending moderation queue', () => {
    expect(parseAdminGardenListQuery(new URL('http://localhost/api/admin/gardens'))).toEqual({
      moderation: 'pendiente',
      limit: 50,
    });
  });

  it('accepts the rejected queue', () => {
    expect(
      parseAdminGardenListQuery(
        new URL('http://localhost/api/admin/gardens?moderation=rechazado&limit=10'),
      ),
    ).toEqual({ moderation: 'rechazado', limit: 10 });
  });

  it('rejects unknown filters', () => {
    expect(() =>
      parseAdminGardenListQuery(new URL('http://localhost/api/admin/gardens?all=true')),
    ).toThrow('Los filtros no son válidos.');
  });

  it('strips metadata and constrains generated WebP dimensions', async () => {
    const original = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#228844' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const processed = await processPhoto(original);
    const full = await sharp(processed.full).metadata();
    const thumbnail = await sharp(processed.thumbnail).metadata();

    expect(full).toMatchObject({ format: 'webp', width: 1000, height: 2000 });
    expect(full.exif).toBeUndefined();
    expect(thumbnail).toMatchObject({ format: 'webp', width: 480, height: 480 });
    expect(thumbnail.exif).toBeUndefined();
  });
});
