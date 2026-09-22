import { describe, expect, it } from 'vitest';

import { ApiError } from './api';
import { parseIdempotencyKey } from './garden-writes';

describe('garden creation idempotency key', () => {
  it('accepts a UUID', () => {
    expect(parseIdempotencyKey('0195f5d0-8e50-7a5c-bc2d-7c0e81d52162')).toBe(
      '0195f5d0-8e50-7a5c-bc2d-7c0e81d52162',
    );
  });

  it.each([null, '', 'not-a-uuid'])('rejects %s', (value) => {
    expect(() => parseIdempotencyKey(value)).toThrow(ApiError);
  });
});
