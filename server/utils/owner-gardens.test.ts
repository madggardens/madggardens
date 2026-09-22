import { beforeEach, describe, expect, it } from 'vitest';

import { parseOwnerGardenListQuery } from './owner-gardens';

describe('owner garden list query', () => {
  beforeEach(() => {
    process.env.CURSOR_SIGNING_SECRET = 'test-cursor-secret-with-at-least-32-characters';
  });

  it('parses a moderation filter and default limit', () => {
    expect(
      parseOwnerGardenListQuery(new URL('http://localhost/api/me/gardens?moderation=rechazado')),
    ).toEqual({ moderation: 'rechazado', limit: 50 });
  });

  it.each([
    'http://localhost/api/me/gardens?limit=51',
    'http://localhost/api/me/gardens?moderation=desconocido',
    'http://localhost/api/me/gardens?unknown=true',
  ])('rejects invalid private-list parameters: %s', (url) => {
    expect(() => parseOwnerGardenListQuery(new URL(url))).toThrow('Los filtros no son válidos.');
  });
});
