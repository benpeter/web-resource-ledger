/*
 * threat-check.js -- Google Web Risk API client for URL threat screening
 *
 * Screens URLs against Google's Web Risk threat intelligence before capture
 * and during periodic re-scans.
 *
 * Security notes:
 *   - API key sent via X-Goog-Api-Key header, NOT query string (avoids log exposure)
 *   - Returned threat types are filtered against a strict allowlist
 *   - Fails open on API errors and timeouts (degraded mode) to avoid blocking
 *     legitimate captures due to transient service outages
 *   - Missing API key returns degraded with reason 'no_api_key' to distinguish
 *     from API outage
 *
 * Tests: test/threat-check.test.js
 */ // tva

const WEB_RISK_ENDPOINT = 'https://webrisk.googleapis.com/v1/uris:search';
const TIMEOUT_MS = 2000;

// Allowlist of threat types we accept from the API response.
// Filter out any unknown values the API might add in future -- we only act
// on what we explicitly understand.
const VALID_THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];

/**
 * Check a single URL against Google Web Risk.
 *
 * @param {string} url - The URL to check
 * @param {object} env - Worker env (needs env.GOOGLE_WEB_RISK_API_KEY)
 * @param {object} [options]
 * @param {function} [options.lookup] - Injectable fetch function for testing.
 *   When null (default), uses the global fetch(). When provided, called as
 *   lookup(requestUrl, init). Follows the same injectable pattern as
 *   resolve4/resolve6 in url-validation.js.
 * @returns {Promise<{safe: boolean, threatTypes?: string[], degraded?: boolean, reason?: string}>}
 */
export async function checkUrl(url, env, { lookup = null } = {}) {
  const apiKey = env?.GOOGLE_WEB_RISK_API_KEY;
  if (!apiKey) {
    return { safe: true, degraded: true, reason: 'no_api_key' };
  }

  const params = new URLSearchParams({ uri: url });
  for (const t of VALID_THREAT_TYPES) {
    params.append('threatTypes', t);
  }
  const requestUrl = `${WEB_RISK_ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const fetchFn = lookup ?? fetch;

  let response;
  try {
    response = await fetchFn(requestUrl, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': apiKey },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError = timeout; TypeError = network failure. Both degrade gracefully.
    return { safe: true, degraded: true };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return { safe: true, degraded: true };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { safe: true, degraded: true };
  }

  // Empty object {} means no threats found.
  if (!body.threat) {
    return { safe: true };
  }

  // Filter returned threat types against the allowlist to guard against
  // unexpected values in future API versions.
  const rawTypes = Array.isArray(body.threat.threatTypes) ? body.threat.threatTypes : [];
  const threatTypes = rawTypes.filter((t) => VALID_THREAT_TYPES.includes(t));

  if (threatTypes.length === 0) {
    // All returned types were unknown -- treat as clean to avoid false positives.
    return { safe: true };
  }

  return { safe: false, threatTypes };
}

/**
 * Check multiple URLs against Google Web Risk (fan-out, one request per URL).
 *
 * Uses Promise.allSettled so a failure on one URL does not cancel others.
 *
 * @param {string[]} urls
 * @param {object} env
 * @param {object} [options]
 * @param {function} [options.lookup] - Injectable fetch function for testing.
 * @returns {Promise<Map<string, {safe: boolean, threatTypes?: string[], degraded?: boolean, reason?: string}>>}
 */
export async function checkUrls(urls, env, { lookup = null } = {}) {
  const results = new Map();
  if (!urls || urls.length === 0) return results;

  const settled = await Promise.allSettled(
    urls.map((url) => checkUrl(url, env, { lookup })),
  );

  for (let i = 0; i < urls.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results.set(urls[i], outcome.value);
    } else {
      // checkUrl itself never rejects (it catches internally), but be safe.
      results.set(urls[i], { safe: true, degraded: true });
    }
  }

  return results;
}
