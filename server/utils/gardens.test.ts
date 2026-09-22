import { beforeEach, describe, expect, it } from 'vitest';

import { parseGardenListQuery } from './gardens';

describe('garden list query', () => {
  beforeEach(() => {
    process.env.CURSOR_SIGNING_SECRET = 'test-cursor-secret-with-at-least-32-characters';
  });

  it('parses a valid viewport and applies the default limit', () => {
    expect(
      parseGardenListQuery(
        new URL('http://localhost/api/gardens?bbox=-3.76,40.37,-3.64,40.46&status=plantado'),
      ),
    ).toEqual({
      bounds: [-3.76, 40.37, -3.64, 40.46],
      status: 'plantado',
      limit: 100,
    });
  });

  it.each([
    'http://localhost/api/gardens',
    'http://localhost/api/gardens?bbox=-4,40,-3,41',
    'http://localhost/api/gardens?bbox=-3.7,40.4,-3.6,40.5&unknown=true',
    'http://localhost/api/gardens?bbox=-3.7,40.4,-3.6,40.5&limit=501',
  ])('rejects invalid map parameters: %s', (url) => {
    expect(() => parseGardenListQuery(new URL(url))).toThrow(
      'Los parámetros del mapa no son válidos.',
    );
  });
});
