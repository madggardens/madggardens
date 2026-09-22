import { afterEach, describe, expect, it } from 'vitest';

import { enforceRateLimit, resetMemoryRateLimits } from './rate-limit';

describe('rate limiting', () => {
  afterEach(() => resetMemoryRateLimits());

  it('allows requests up to the configured limit and returns headers', async () => {
    const event = { req: new Request('http://localhost/api/test') } as never;
    await expect(
      enforceRateLimit(event, { namespace: 'test', limit: 1, windowSeconds: 60, identity: 'ip' }),
    ).resolves.toMatchObject({ 'ratelimit-remaining': '0' });
  });

  it('rejects requests over the configured limit', async () => {
    const event = { req: new Request('http://localhost/api/test') } as never;
    const policy = { namespace: 'test', limit: 1, windowSeconds: 60, identity: 'ip' } as const;
    await enforceRateLimit(event, policy);
    await expect(enforceRateLimit(event, policy)).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });
});
