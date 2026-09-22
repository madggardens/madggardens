import { defineHandler } from 'nitro';

import type { HealthResponse } from '../../shared/contracts/health';

export default defineHandler((): HealthResponse => {
  return {
    data: {
      status: 'ok',
      service: 'madggardens-api',
      timestamp: new Date().toISOString(),
    },
  };
});
