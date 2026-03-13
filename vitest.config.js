import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: {
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
          },
          // R2 isolated storage uses SQLite WAL files that can remain open
          // between tests, causing "failed to pop isolated storage stack frame"
          // errors. All tests do explicit cleanup in beforeEach.
          isolatedStorage: false,
        },
      },
    },
  },
});
