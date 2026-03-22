import { env } from 'cloudflare:test';
import { applyD1Migrations } from '@cloudflare/vitest-pool-workers/d1';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
