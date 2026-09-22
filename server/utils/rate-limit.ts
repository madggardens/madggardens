import { createHash } from 'node:crypto';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { HTTPEvent } from 'h3';

import { ApiError } from './api';

export type RateLimitPolicy = {
  namespace: string;
  limit: number;
  windowSeconds: number;
  identity: 'ip' | 'authorization';
};

type MemoryEntry = { count: number; reset: number };
const memoryLimits = new Map<string, MemoryEntry>();
const remoteLimiters = new Map<string, Ratelimit>();

function identifier(event: HTTPEvent, policy: RateLimitPolicy) {
  if (policy.identity === 'authorization') {
    const authorization = event.req.headers.get('authorization') ?? 'anonymous';
    return createHash('sha256').update(authorization).digest('hex');
  }
  const forwarded = event.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || event.req.headers.get('x-real-ip') || 'local';
}

function getRemoteLimiter(policy: RateLimitPolicy) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const key = `${policy.namespace}:${policy.limit}:${policy.windowSeconds}`;
  let limiter = remoteLimiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSeconds} s`),
      prefix: `madggardens:${policy.namespace}`,
      analytics: true,
    });
    remoteLimiters.set(key, limiter);
  }
  return limiter;
}

export async function enforceRateLimit(event: HTTPEvent, policy: RateLimitPolicy) {
  const id = identifier(event, policy);
  const remote = getRemoteLimiter(policy);
  let success: boolean;
  let remaining: number;
  let reset: number;

  if (remote) {
    const result = await remote.limit(id);
    ({ success, remaining, reset } = result);
  } else {
    const now = Date.now();
    const key = `${policy.namespace}:${id}`;
    const current = memoryLimits.get(key);
    const entry =
      !current || current.reset <= now
        ? { count: 1, reset: now + policy.windowSeconds * 1000 }
        : { count: current.count + 1, reset: current.reset };
    memoryLimits.set(key, entry);
    success = entry.count <= policy.limit;
    remaining = Math.max(0, policy.limit - entry.count);
    reset = entry.reset;
  }

  const headers = {
    'ratelimit-limit': String(policy.limit),
    'ratelimit-remaining': String(remaining),
    'ratelimit-reset': String(Math.ceil(reset / 1000)),
  };
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Has realizado demasiadas peticiones. Inténtalo más tarde.',
      [{ retryAfter }],
      { ...headers, 'retry-after': String(retryAfter) },
    );
  }
  return headers;
}

export function resetMemoryRateLimits() {
  memoryLimits.clear();
}
