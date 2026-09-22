import { randomUUID } from 'node:crypto';

import { defineHandler } from 'h3';
import type { HTTPEvent } from 'h3';

import type { ApiErrorCode, ApiErrorResponse } from '../../shared/contracts/errors';
import { enforceRateLimit, type RateLimitPolicy } from './rate-limit';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: unknown[] = [],
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
      ...headers,
    },
  });
}

type ApiHandlerOptions = {
  headers?: Record<string, string> | ((event: HTTPEvent) => Record<string, string>);
  status?: number;
  rateLimit?: RateLimitPolicy;
};

export function defineApiHandler<T>(
  handler: (event: HTTPEvent, requestId: string) => T | Promise<T>,
  options: ApiHandlerOptions = {},
) {
  return defineHandler(async (event) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    let responseHeaders =
      typeof options.headers === 'function' ? options.headers(event) : options.headers;
    const finish = (status: number) => {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'api_request_completed',
          requestId,
          method: event.req.method,
          path: new URL(event.req.url).pathname,
          status,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        }),
      );
    };

    try {
      if (options.rateLimit) {
        responseHeaders = {
          ...responseHeaders,
          ...(await enforceRateLimit(event, options.rateLimit)),
        };
      }
      const status = options.status ?? 200;
      const response = jsonResponse(
        await handler(event, requestId),
        status,
        requestId,
        responseHeaders,
      );
      finish(status);
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        const body: ApiErrorResponse = {
          error: {
            code: error.code,
            message: error.message,
            requestId,
            details: error.details,
          },
        };

        finish(error.status);
        return jsonResponse(body, error.status, requestId, {
          ...responseHeaders,
          ...error.headers,
        });
      }

      console.error(
        JSON.stringify({
          level: 'error',
          event: 'api_request_failed',
          requestId,
          error: error instanceof Error ? error.name : 'UnknownError',
        }),
      );

      const body: ApiErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'No se ha podido completar la solicitud.',
          requestId,
          details: [],
        },
      };

      finish(500);
      return jsonResponse(body, 500, requestId, responseHeaders);
    }
  });
}
