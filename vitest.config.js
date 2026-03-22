import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { generateKeyPairSync } from 'node:crypto';

// Test keys generated at load time -- no key material committed to VCS
// Primary key: used as the current SIGNING_KEY
// Archived key: injected as TEST_ARCHIVED_KEY for key rotation test scenarios
const { privateKey: _testPrivateKey } = generateKeyPairSync('ed25519');
const testSigningKey = _testPrivateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

const { privateKey: _testArchivedKey } = generateKeyPairSync('ed25519');
const testArchivedKey = _testArchivedKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

export default defineWorkersConfig({
  test: {
    exclude: ['test/integration/**', 'packages/**', 'node_modules/**'],
    poolOptions: {
      workers: {
        wrangler: {
          // Use test-specific config that omits [[queues.consumers]].
          // Auto-consumption triggers performCapture() with browser binding
          // during tests, causing isolated storage corruption in the runtime.
          configPath: './wrangler.test.toml',
        },
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: {
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
            ADMIN_KEY: 'test-admin-key-for-vitest',
            SIGNING_KEY: testSigningKey,
            TEST_ARCHIVED_KEY: testArchivedKey,
            CORS_ORIGINS: 'https://allowed.example.com,https://other-allowed.example.com',
            IP_HASH_SEED: 'test-ip-hash-seed-for-vitest',
            TSA_URL: 'http://timestamp.digicert.com',
          },
          // Queue producers come from wrangler.test.toml; consumers are
          // omitted there to prevent auto-consumption during tests.
          // R2 isolated storage uses SQLite WAL files that can remain open
          // between tests, causing "failed to pop isolated storage stack frame"
          // errors. All tests do explicit cleanup in beforeEach.
          isolatedStorage: false,
        },
      },
    },
  },
});
