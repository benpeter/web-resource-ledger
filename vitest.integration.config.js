import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test keys generated at load time -- no key material committed to VCS
const { privateKey: _testPrivateKey } = generateKeyPairSync('ed25519');
const testSigningKey = _testPrivateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

const TEST_MIGRATIONS = await readD1Migrations(path.join(__dirname, 'migrations'));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.toml',
      },
      miniflare: {
        browserRendering: { binding: 'BROWSER' },
        bindings: {
          TEST_MIGRATIONS,
          CAPTURE_API_KEY: 'test-api-key-for-vitest',
          SIGNING_KEY: testSigningKey,
          CORS_ORIGINS: 'https://allowed.example.com',
          IP_HASH_SEED: 'test-ip-hash-seed-for-vitest',
          TSA_URL: 'http://timestamp.digicert.com',
        },
      },
    }),
  ],
  test: {
    include: ['test/integration/**/*.test.js'],
    setupFiles: ['./test/apply-migrations.js'],
    testTimeout: 60000,
    hookTimeout: 30000,
    globalSetup: ['./test/integration/global-setup.js'],
    // Integration tests need real network -- do NOT activate fetchMock
  },
});
