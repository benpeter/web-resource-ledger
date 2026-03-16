import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { generateKeyPairSync } from 'node:crypto';

// Test keys generated at load time -- no key material committed to VCS
const { privateKey: _testPrivateKey } = generateKeyPairSync('ed25519');
const testSigningKey = _testPrivateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

export default defineWorkersConfig({
  test: {
    include: ['test/integration/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 30000,
    globalSetup: ['./test/integration/global-setup.js'],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: {
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
            SIGNING_KEY: testSigningKey,
            CORS_ORIGINS: 'https://allowed.example.com',
            IP_HASH_SEED: 'test-ip-hash-seed-for-vitest',
            TSA_URL: 'http://timestamp.digicert.com',
          },
          // R2 isolated storage uses SQLite WAL files that can remain open
          // between tests, causing "failed to pop isolated storage stack frame"
          // errors. All tests do explicit cleanup in beforeEach.
          isolatedStorage: false,
        },
      },
    },
    // Integration tests need real network -- do NOT activate fetchMock
  },
});
