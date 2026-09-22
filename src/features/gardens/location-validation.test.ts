import { describe, expect, it } from 'vitest';

import { isWithinMadridBoundingBox } from './location-validation';

describe('isWithinMadridBoundingBox', () => {
  it('accepts a central Madrid coordinate', () => {
    expect(isWithinMadridBoundingBox([-3.7038, 40.4168])).toBe(true);
  });

  it('rejects an obviously out-of-area coordinate before upload', () => {
    expect(isWithinMadridBoundingBox([-3.95, 40.4168])).toBe(false);
  });
});
