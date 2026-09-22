import { defineConfig } from 'nitro';

const scriptSource =
  process.env.NODE_ENV === 'production' ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'";

export default defineConfig({
  serverDir: './server',
  routeRules: {
    '/**': {
      headers: {
        'content-security-policy': `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' https: http://127.0.0.1:* ws://127.0.0.1:*; font-src 'self' data:`,
        'cross-origin-opener-policy': 'same-origin',
        'permissions-policy': 'camera=(), microphone=(), geolocation=(self)',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
      },
    },
  },
});
