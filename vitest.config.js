import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test keys generated at load time -- no key material committed to VCS
// Primary key: used as the current SIGNING_KEY
// Archived key: injected as TEST_ARCHIVED_KEY for key rotation test scenarios
const { privateKey: _testPrivateKey } = generateKeyPairSync('ed25519');
const testSigningKey = _testPrivateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

const { privateKey: _testArchivedKey } = generateKeyPairSync('ed25519');
const testArchivedKey = _testArchivedKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

const TEST_MIGRATIONS = await readD1Migrations(path.join(__dirname, 'migrations'));

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/apply-migrations.js'],
    exclude: ['test/integration/**', 'test/e2e/**', 'test/mcp-sync.test.js', 'packages/**', 'node_modules/**', 'site/**'],
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
            TEST_MIGRATIONS,
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
            ADMIN_KEY: 'test-admin-key-for-vitest',
            SIGNING_KEY: testSigningKey,
            TEST_ARCHIVED_KEY: testArchivedKey,
            CORS_ORIGINS: 'https://allowed.example.com,https://other-allowed.example.com',
            IP_HASH_SEED: 'test-ip-hash-seed-for-vitest',
            TSA_URL: 'http://timestamp.digicert.com',
            QUALIFIED_TSA_URL: 'https://qualified-tsa.test.invalid',
            GITHUB_CLIENT_ID: 'test-github-client-id',
            GITHUB_CLIENT_SECRET: 'test-github-client-secret',
            SESSION_SECRET: 'deadbeef'.repeat(8),
            STRIPE_SECRET_KEY: 'sk_test_placeholder_for_testing',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_placeholder_for_testing',
            STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder_for_testing',
            STRIPE_CAPTURE_PRICE_ID: 'price_test_placeholder_for_testing',
            PIRSCH_ACCESS_KEY: 'test-pirsch-key-for-vitest',
            CORALOGIX_WEBHOOK_SECRET: 'test-coralogix-webhook-secret-for-vitest',
            GITHUB_DISPATCH_TOKEN: 'test-github-dispatch-token-for-vitest',
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
