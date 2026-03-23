/**
 * api-client.js -- Fetch helpers for WRL e2e tests
 *
 * Uses native fetch (Node 18+). Intentionally NOT using Playwright's
 * APIRequestContext so these helpers are usable in global-setup and
 * global-teardown too, where the Playwright test fixture is unavailable.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '..', '.auth-state.json');

const POLL_INTERVAL_MS = 3000;

/**
 * Read the persisted test-tenant auth state from .auth-state.json.
 *
 * @returns {{ tenantId: string, apiKey: string, keyHash: string, baseUrl: string }}
 */
export function readAuthState() {
  let raw;
  try {
    raw = readFileSync(STATE_FILE, 'utf8');
  } catch (err) {
    throw new Error(
      `.auth-state.json not found -- did global-setup run? (${err.message})`
    );
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (err) {
    throw new Error(`.auth-state.json contains invalid JSON: ${err.message}`);
  }

  for (const field of ['tenantId', 'apiKey', 'keyHash', 'baseUrl']) {
    if (!state[field]) {
      throw new Error(`.auth-state.json is missing required field '${field}'`);
    }
  }

  return state;
}

/**
 * Create an authenticated fetch wrapper bound to a base URL and API key.
 *
 * The returned function has the same signature as native fetch(path, init?)
 * but path is resolved relative to baseUrl and the Authorization header is
 * added automatically.
 *
 * @param {string} baseUrl   Worker base URL (no trailing slash)
 * @param {string} apiKey    Bearer token
 * @returns {(path: string, init?: RequestInit) => Promise<Response>}
 */
export function createAuthenticatedFetch(baseUrl, apiKey) {
  const normalizedBase = baseUrl.replace(/\/$/, '');

  return async function authenticatedFetch(path, init = {}) {
    const url = path.startsWith('http') ? path : `${normalizedBase}${path}`;

    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${apiKey}`);

    return fetch(url, { ...init, headers });
  };
}

/**
 * Poll /v1/captures/{captureId}/status until terminal state or timeout.
 *
 * Polls every 3 seconds. Terminal states are 'complete' and 'failed'.
 * On timeout, throws a descriptive error rather than returning null or
 * undefined -- silent timeouts produce unintelligible assertion failures.
 *
 * @param {Function} fetchFn        Authenticated fetch wrapper from createAuthenticatedFetch()
 * @param {string}   captureId      Capture ID to poll
 * @param {number}   timeoutMs      Max wait in milliseconds (default: 60000)
 * @returns {Promise<{ status: string, [key: string]: unknown }>}
 * @throws  {Error} if timeout is reached before terminal state
 */
export async function pollUntilComplete(fetchFn, captureId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;

    const res = await fetchFn(`/v1/captures/${captureId}/status`);

    if (!res.ok) {
      // Non-200 during polling is unexpected but may be transient -- keep polling
      // until timeout rather than throwing immediately
      const body = await res.text().catch(() => '');
      console.warn(`[pollUntilComplete] HTTP ${res.status} polling capture ${captureId} (attempt ${attempts}): ${body}`);
    } else {
      const data = await res.json();
      lastStatus = data.status;

      if (lastStatus === 'complete' || lastStatus === 'failed') {
        return data;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    // Sleep for the poll interval, but don't wait past the deadline
    await new Promise(resolve => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)));
  }

  const elapsedSec = Math.round((timeoutMs - (deadline - Date.now())) / 1000);
  throw new Error(
    `pollUntilComplete: capture '${captureId}' did not reach terminal state within ` +
    `${timeoutMs}ms (${elapsedSec}s elapsed). Last known status: '${lastStatus ?? 'unknown'}'. ` +
    `Check staging worker logs for this capture ID.`
  );
}
