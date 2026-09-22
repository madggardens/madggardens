import { beforeEach, describe, expect, it } from 'vitest';

import { decodeGardenCursor, encodeGardenCursor } from './cursor';

describe('garden cursor', () => {
  beforeEach(() => {
    process.env.CURSOR_SIGNING_SECRET = 'test-cursor-secret-with-at-least-32-characters';
  });

  it('round-trips a signed cursor', () => {
    const encoded = encodeGardenCursor({
      createdAt: '2026-09-20T10:00:00.000Z',
      id: '10000000-0000-4000-8000-000000000001',
    });

    expect(decodeGardenCursor(encoded)).toEqual({
      version: 1,
      createdAt: '2026-09-20T10:00:00.000Z',
      id: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects a modified cursor', () => {
    const encoded = encodeGardenCursor({
      createdAt: '2026-09-20T10:00:00.000Z',
      id: '10000000-0000-4000-8000-000000000001',
    });

    expect(() => decodeGardenCursor(`${encoded}modified`)).toThrow('El cursor no es válido.');
  });
});
