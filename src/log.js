// tva

/**
 * Ships a structured log entry to Coralogix. Fire-and-forget.
 * Returns the fetch Promise so callers CAN pass it to ctx.waitUntil().
 * Returns undefined (no-op) if CORALOGIX_ENDPOINT or CORALOGIX_SEND_KEY
 * is absent (local dev, tests, preview environments).
 *
 * INVARIANT: `data` must contain only static values and predetermined
 * strings, never attacker-controlled input. HMAC-derived values from
 * request data (e.g., hashed IP) are acceptable because the output is a
 * fixed-length hex string that cannot contain injection payloads.
 * Truncated framework error messages (e.g., Playwright) are acceptable
 * when the framework does not echo user-supplied content into its error
 * strings. Callers are responsible for ensuring this contract.
 *
 * Permitted identifiers whose construction does NOT incorporate
 * attacker-controlled input:
 *   - captureId: UUID v4, randomly generated
 *   - keyId: SHA-256 prefix of an operator-managed secret
 * Do not treat values derived from attacker-supplied input as safe under
 * this invariant without an explicit exception below.
 *
 * Accepted exception -- WHATWG-normalized URLs from validateUrl(): scheme
 * is restricted to http/https, credentials are stripped, length is capped
 * at 2048 chars. This applies to the `url` field in capture.start events.
 *
 * Subsystem registry (all valid subsystem names):
 *   - "capture"  -- capture pipeline lifecycle (start, success, partial, fail)
 *   - "security" -- auth failures, SSRF blocks, rate limits, key issues
 *   - "list"     -- list captures operations (success, error)
 *   - "audit"    -- authenticated request audit trail (tenant activity, compliance)
 *
 * Audit subsystem constraint: all fields are either static strings,
 * server-generated identifiers (captureId, keyId), or HMAC-derived values
 * (cip). The raw API key, bearer token, and raw IP address must NEVER
 * appear in any log entry.
 *
 * @param {object} env Worker env bindings
 * @param {number} severity Coralogix severity: 3=info, 4=warn, 5=error, 6=verbose
 * @param {string} subsystem Module name: "capture", "security", "list", "audit"
 * @param {object} data Structured payload (event, captureId, stage, etc.)
 * @returns {Promise<void>|undefined}
 */
export function log(env, severity, subsystem, data) {
  if (!env.CORALOGIX_ENDPOINT || !env.CORALOGIX_SEND_KEY) return;
  try {
    return fetch(env.CORALOGIX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.CORALOGIX_SEND_KEY}`,
      },
      body: JSON.stringify([{
        applicationName: env.APPLICATION_NAME || 'wrl',
        subsystemName: subsystem,
        severity,
        timestamp: Date.now(),
        text: JSON.stringify(data),
      }]),
    }).catch((err) => {
      console.warn('wrl:log_delivery_fail', { event: data?.event, errorMessage: String(err?.message ?? '').slice(0, 128) });
    });
  } catch (err) {
    console.warn('wrl:log_build_fail', { event: data?.event, errorMessage: String(err?.message ?? '').slice(0, 128) });
    return;
  }
}
