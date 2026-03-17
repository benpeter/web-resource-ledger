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
    }).catch(() => {}); // Logging failure is terminal -- nowhere to log it
  } catch (_logErr) { return; } // JSON serialization or fetch setup failed -- no safe recourse
}
