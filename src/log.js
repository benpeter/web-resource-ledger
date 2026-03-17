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
 * strings. Validated and re-serialized URLs (post-validateUrl) are acceptable
 * as they are scheme-restricted and constructor-normalized. Fields validated
 * at creation time against restrictive regexes (tenantId via TENANT_ID_RE,
 * keyName via NAME_RE) are acceptable as their character sets are bounded
 * and injection-safe. Callers are responsible for ensuring this contract.
 *
 * NEVER LOG: raw API keys (tokens), raw ADMIN_KEY, raw IP addresses
 * (use computeCip), Authorization header values, full keyHash (use
 * keyHashPrefix: hash.slice(0, 8)), request/response objects, or
 * unvalidated request body content. Always destructure and pick
 * specific fields -- never pass auth result objects directly.
 *
 * @param {object} env Worker env bindings
 * @param {number} severity Coralogix severity: 3=info, 4=warn, 5=error
 * @param {string} subsystem Module name: "capture", "security"
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
