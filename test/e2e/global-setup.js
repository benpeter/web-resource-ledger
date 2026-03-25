/**
 * global-setup.js -- Playwright globalSetup for e2e tests
 *
 * Runs before any test. Creates an isolated test tenant in the staging
 * environment and persists its credentials to .auth-state.json so specs
 * can read them without touching the admin API themselves.
 *
 * The admin key is intentionally NOT written to the state file. Any test
 * that needs the admin key must read process.env.E2E_ADMIN_KEY directly.
 *
 * Rate limit: admin endpoints allow 5 req/60s. This setup makes exactly
 * 2 admin calls (POST /v1/admin/keys + PUT /v1/admin/tenants/{id}/config)
 * plus 1 health check (unauthenticated, not rate-limited).
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '.auth-state.json');

export default async function globalSetup() {
  const baseUrl = (process.env.E2E_BASE_URL || 'https://staging.webresourceledger.com').replace(/\/$/, '');
  const adminKey = process.env.E2E_ADMIN_KEY;

  if (!adminKey) {
    throw new Error('E2E_ADMIN_KEY environment variable is required for e2e tests');
  }

  // --- Health check ---
  let healthRes;
  try {
    healthRes = await fetch(`${baseUrl}/health`);
  } catch (err) {
    throw new Error(`Staging environment unreachable at ${baseUrl}: ${err.message}`);
  }

  if (!healthRes.ok) {
    const body = await healthRes.text().catch(() => '');
    throw new Error(
      `Health check failed: ${baseUrl}/health returned HTTP ${healthRes.status}. ` +
      `Aborting e2e setup to avoid creating orphaned keys.\nResponse: ${body}`
    );
  }

  const health = await healthRes.json();
  if (health.status !== 'ok') {
    throw new Error(`Health check returned unexpected status '${health.status}' (expected 'ok')`);
  }

  // --- Create test tenant ---
  const tenantId = `e2e-${Date.now()}`;

  const createRes = await fetch(`${baseUrl}/v1/admin/keys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId,
      scopes: ['capture', 'read'],
      name: 'e2e test key',
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(
      `Failed to create test tenant key (HTTP ${createRes.status}). ` +
      `Response: ${body}`
    );
  }

  const created = await createRes.json();
  const { key: apiKey, keyHash } = created;

  // --- Set elevated quotas ---
  const configRes = await fetch(`${baseUrl}/v1/admin/tenants/${tenantId}/config`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quotas: { capturesPerMonth: 500 },
    }),
  });

  if (!configRes.ok) {
    const body = await configRes.text().catch(() => '');
    // Non-fatal: tests can still run with default quotas, but warn loudly.
    console.warn(
      `[e2e setup] WARNING: Failed to set elevated quotas for tenant '${tenantId}' ` +
      `(HTTP ${configRes.status}). Tests will run with default quotas.\n` +
      `Response: ${body}`
    );
  }

  // --- Persist state (admin key intentionally excluded) ---
  const state = {
    tenantId,
    apiKey,
    keyHash,
    baseUrl,
  };

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  console.log(`[e2e setup] Tenant '${tenantId}' created. State written to .auth-state.json`);
}
