/**
 * global-teardown.js -- Playwright globalTeardown for e2e tests
 *
 * Runs after all tests complete. Revokes the test tenant's API key to
 * avoid accumulating orphaned keys in staging.
 *
 * Cleanup failure is non-fatal -- a warning is logged but no exception
 * is thrown. Orphaned keys expire naturally and cannot capture without
 * explicit use, so the risk is low.
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '.auth-state.json');

export default async function globalTeardown() {
  const adminKey = process.env.E2E_ADMIN_KEY;

  let state;
  try {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    console.warn(`[e2e teardown] Could not read .auth-state.json -- skipping cleanup: ${err.message}`);
    return;
  }

  const { baseUrl, keyHash, tenantId } = state;

  if (!adminKey) {
    console.warn(`[e2e teardown] E2E_ADMIN_KEY not set -- cannot revoke key for tenant '${tenantId}'. Orphaned key: ${keyHash.slice(0, 8)}...`);
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/v1/admin/keys/${keyHash}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminKey}`,
      },
    });

    if (res.ok) {
      console.log(`[e2e teardown] Revoked key for tenant '${tenantId}'`);
    } else {
      const body = await res.text().catch(() => '');
      console.warn(
        `[e2e teardown] WARNING: Failed to revoke key for tenant '${tenantId}' ` +
        `(HTTP ${res.status}). Orphaned key hash prefix: ${keyHash.slice(0, 8)}...\n` +
        `Response: ${body}`
      );
    }
  } catch (err) {
    console.warn(
      `[e2e teardown] WARNING: Network error revoking key for tenant '${tenantId}': ${err.message}. ` +
      `Orphaned key hash prefix: ${keyHash.slice(0, 8)}...`
    );
  }

  // Remove state file -- it contains the API key which is now revoked
  try {
    unlinkSync(STATE_FILE);
  } catch (err) {
    console.warn(`[e2e teardown] Could not delete .auth-state.json: ${err.message}`);
  }
}
