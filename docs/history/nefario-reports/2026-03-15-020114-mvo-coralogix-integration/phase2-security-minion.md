## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Security Event Log Fields

Every security event log entry should include the **common envelope** (timestamp, event_type, severity) plus these security-specific fields:

| Field | Include? | Rationale |
|-------|----------|-----------|
| `client_ip` | **Yes** -- hash it | CF-Connecting-IP is essential for correlating brute-force and rate-limit abuse. But logging raw IPs creates GDPR Art. 6 obligations (IP is PII in the EU). **Log a one-way HMAC-SHA256 of the IP using a rotating daily key derived from a secret.** This preserves correlation within a 24-hour window for incident response while making the field non-reversible for compliance. The raw IP must never appear in logs. |
| `request_path` | **Yes, but static** | Log the matched route pattern (e.g., `/v1/captures`) -- never the full path with capture IDs. Capture IDs are bearer tokens (the comment on line 130 of `index.js` says "capture ID acts as the access secret"). Logging them would leak access credentials into the observability pipeline. For 404s (unmatched routes), log a static string like `"unmatched"` -- never reflect the actual path (CWE-209, and the existing code already follows this pattern on line 44-46). |
| `request_method` | **Yes** | Safe to log; it's from a fixed enum. |
| `user_agent` | **No** | User-Agent strings are high-cardinality attacker-controlled input. They provide marginal forensic value (trivially spoofed) while inflating log volume and creating injection risk if the log pipeline has downstream consumers that don't sanitize. Omit unless a specific incident investigation requires it, at which point it can be enabled temporarily. |
| `rejection_reason` | **Yes** | A short, static, enumerated reason code (e.g., `"missing_auth_header"`, `"invalid_api_key"`, `"ssrf_private_ip"`, `"rate_limit_per_ip"`, `"rate_limit_global"`). This is the primary field for alerting and dashboarding. Use a fixed enum -- never interpolate untrusted input into this field. |
| `response_status` | **Yes** | The HTTP status code returned (401, 422, 429, etc.). |

**Information disclosure risks to mitigate:**
- **Never log the provided API key or any prefix/suffix of it.** The current `auth.js` already has a SECURITY comment about this (line 56). The logging layer must maintain this invariant.
- **Never log the target URL from the request body** in security events. The URL is user-supplied content and could contain credentials, tokens, or sensitive path segments. For SSRF blocks, log only the rejection reason (see next section).
- **Never log raw CF-Connecting-IP.** Use the HMAC approach above.
- **Capture IDs must not appear in security event logs.** They are access secrets.

#### 2. SSRF Block Logging -- What to Include

**Log the rejection reason only. Do not log the rejected URL or hostname.**

Rationale:
- **Debuggability concern is low.** The SSRF rejection reasons in `url-validation.js` are already specific enough to diagnose issues: `"URL exceeds 2048 character limit"`, `"URL is not valid"`, `"URL scheme 'ftp' is not allowed"`, `"URLs with embedded credentials are not allowed"`, `"Host resolves to a private IP address"`, `"Could not resolve hostname"`, `"URL contains double-encoded characters"`. Each maps to a distinct attack vector. An operator seeing a spike in `"ssrf_private_ip"` rejections knows exactly what is happening without needing the URL.
- **Logging the URL leaks attacker reconnaissance.** If an attacker is probing internal infrastructure (e.g., submitting `http://169.254.169.254/latest/meta-data/`), logging that URL means anyone with Coralogix access can see which internal targets are being probed. Worse, if the Coralogix pipeline is compromised, an attacker gets a free map of what other attackers have tried.
- **Logging the hostname alone is also problematic.** Hostnames in SSRF probes are often internal DNS names that reveal network topology (e.g., `redis.internal.corp`, `metadata.google.internal`).

**Recommended approach:** Map each `url-validation.js` rejection to a static reason code:

```
url_too_long          -> "URL exceeds 2048 character limit"
url_invalid           -> "URL is not valid"
scheme_not_allowed    -> "URL scheme '...' is not allowed"
embedded_credentials  -> "URLs with embedded credentials are not allowed"
ssrf_private_ip       -> "Host resolves to a private IP address"
dns_resolution_failed -> "Could not resolve hostname"
double_encoded        -> "URL contains double-encoded characters"
```

Log the reason code, not the detail string (the detail string for scheme rejection includes the scheme name, which is attacker-controlled input). For the scheme case, the reason code `scheme_not_allowed` is sufficient.

#### 3. Additional Security Events to Log

Beyond the three explicitly named in the issue (auth failures, SSRF blocks, rate limit hits), the following rejection points in the current codebase should also emit security events:

| Event | Location | Why It Matters |
|-------|----------|----------------|
| **Content-Type rejection** (415) | `index.js:64` | Signals scanning/fuzzing. A spike in 415s means someone is sending non-JSON payloads -- often an automated tool probing for XML/multipart injection vectors. |
| **Malformed JSON** (400) | `index.js:90` | Related to fuzzing. Also catches truncated requests from network errors, useful for distinguishing attack traffic from client bugs. |
| **Missing/invalid `url` field** (400) | `index.js:95-100` | Malformed API requests. Low severity individually but high-volume spikes indicate automated abuse. |
| **Route not matched** (404) | `index.js:43-46` | Path scanning / directory enumeration. A burst of 404s with diverse paths is a classic recon signature. Log as severity `low` with event type `unmatched_route`. Do NOT log the path (existing code already avoids reflecting it). |
| **Service misconfiguration** (503) | `auth.js:32` | `CAPTURE_API_KEY` is not set. This is a **critical operational event**, not an attack, but it must be logged at severity `critical` because it means auth is broken and no captures can proceed. Also catches `getSigningKeys()` returning null on the verify endpoint (`index.js:248`). |
| **Verify rate limit hit** (429) | `index.js:243` | The verify endpoint is unauthenticated and public. Rate limit hits here are a different signal than capture rate limits -- they may indicate someone trying to enumerate capture IDs by brute-forcing the verify endpoint. |
| **Global capacity limit** (503) | `index.js:83` | Service-wide overload. Not a security event per se, but essential for distinguishing DDoS-induced capacity exhaustion from organic traffic spikes. Log as `operational` category with severity `high`. |
| **WACZ bundling failure** | `capture.js:150-153` | Currently logged with `console.warn`. Should be a structured event. While not a security event, a persistent pattern of WACZ failures could indicate a signing key compromise or rotation issue. |

**Events to NOT log:**
- Successful captures (the issue already calls this out -- that's an operational metric, not a security event; handle separately)
- Individual subresource blocks in the browser context route handler (too noisy, and the capture either succeeds or fails as a unit)

#### 4. Coralogix Send Key Security Assessment

**Current pattern analysis:**

The `wrangler.toml` shows secrets are managed via Cloudflare Worker bindings (the `CAPTURE_API_KEY` is accessed via `env.CAPTURE_API_KEY`). Cloudflare Worker secrets set via `wrangler secret put` are encrypted at rest and injected at runtime -- they never appear in `wrangler.toml` or source code. This is the correct pattern.

The Coralogix Send API key will follow the same model: `wrangler secret put CORALOGIX_API_KEY` and accessed via `env.CORALOGIX_API_KEY`.

**Assessment: The current secret pattern is sufficient, with caveats:**

1. **Worker code CAN read the secret value at runtime.** This is inherent to any secret injection model -- the application must be able to use the secret. The risk is that a code-level vulnerability (e.g., if someone added a debug endpoint that dumps `env`) could leak it. **Mitigation:** The codebase has no debug endpoints, the route table is explicit and locked down, and the `env` object is never serialized or logged. This is adequate.

2. **The Coralogix Send key is write-only by design.** Coralogix "Send Your Data" API keys can only push logs -- they cannot query, delete, or modify existing logs. Even if the key leaks, the blast radius is limited to log injection (an attacker could flood Coralogix with fake log entries). **Mitigations:**
   - Coralogix supports IP allowlisting on Send keys -- restrict to Cloudflare Worker egress IP ranges if feasible (though CF Worker IPs are shared, this still narrows the surface).
   - Set a reasonable ingestion rate limit on the Coralogix side.
   - Monitor for anomalous log volume spikes in Coralogix itself.

3. **Secret rotation:** Cloudflare Worker secrets do not auto-rotate. The Coralogix key should be rotated periodically (quarterly is reasonable for a write-only key). Document the rotation procedure. No code change is needed for rotation -- `wrangler secret put` overwrites the existing value.

4. **Do NOT put the Coralogix key in `wrangler.toml` as a plaintext variable.** This sounds obvious, but the temptation exists because `wrangler.toml` already has non-secret bindings. The key must go through `wrangler secret put` only.

5. **Log the key's last-4 characters on startup (optional, low priority).** Some operators log a key fingerprint (last 4 chars) on service startup to confirm which key is active. This is safe for a write-only key and helps debug "why aren't logs arriving" without exposing the full key.

### Proposed Tasks

1. **Define security event schema with the field constraints above.** The schema must enforce: no raw IPs (HMAC only), no capture IDs, no target URLs, no API key fragments, enumerated reason codes only. This should be a shared type/constant that the logger enforces, not a convention that each call site has to remember.

2. **Map all rejection points to security event emitters.** Walk through `index.js`, `auth.js`, and `url-validation.js` and add structured log calls at each rejection point listed in the table above. Each emitter should produce a well-typed event with the correct severity level:
   - `critical`: service misconfiguration (missing API key, missing signing key)
   - `high`: auth failures (invalid key, missing header), SSRF blocks
   - `medium`: rate limit hits (per-IP and global), Content-Type rejections
   - `low`: malformed JSON, missing fields, unmatched routes

3. **Implement IP hashing utility.** A small function that takes `CF-Connecting-IP` and a daily-rotating key (derived from a secret via HKDF or similar) and returns an HMAC-SHA256 hex digest. The secret can be the existing `CAPTURE_API_KEY` or a dedicated `LOG_HMAC_KEY` -- using a dedicated key is cleaner but adds another secret to manage. The daily rotation can use `Math.floor(Date.now() / 86400000)` as the HKDF info parameter.

4. **Add Coralogix key via `wrangler secret put`.** Document this in the deployment guide. Verify the key is write-only in the Coralogix console before deploying.

5. **Add log-injection guard on the transport layer.** When sending logs to Coralogix, ensure the JSON serialization cannot be broken by attacker-controlled content. Since the schema above excludes all user-supplied strings (no URLs, no paths, no user-agents), this risk is already mitigated by design. But as defense-in-depth, the JSON serializer should use `JSON.stringify` (safe against injection by construction) and never string-concatenate log fields.

### Risks and Concerns

1. **GDPR / IP-as-PII.** Raw IP logging is a compliance risk. The HMAC approach above mitigates this, but the team should confirm with legal/compliance that hashed IPs meet their data processing requirements. If the project operates under GDPR, a DPIA (Data Protection Impact Assessment) may be needed for the logging pipeline. This is a process risk, not a technical one.

2. **Capture ID leakage through correlation.** Even without logging capture IDs directly, a security event log that includes a timestamp + hashed IP + success status could be correlated with the capture creation timestamp stored in KV to link a security event to a specific capture. This is a low-probability risk (requires access to both Coralogix and KV), but worth noting. **Mitigation:** Ensure Coralogix access is restricted to operators who already have KV access.

3. **Log volume under attack.** A determined attacker sending thousands of invalid requests per second will generate thousands of security event logs per second. At Coralogix pricing, this could be expensive. **Mitigations:**
   - The existing rate limiters (10 req/60s per IP for capture, 60 req/60s per IP for verify) cap the per-IP event rate.
   - For unmatched routes (404s), there is NO rate limiter. An attacker can generate unlimited 404 security events. **Recommendation:** Add a rate limiter for unmatched routes, or sample 404 security events (e.g., log 1 in 10 after the first 100 in a 60-second window).
   - The global capture limiter (200/60s) caps total capture-path events but not verify-path or 404 events.

4. **`ctx.waitUntil` budget for log shipping.** The Coralogix HTTP push happens inside the Worker. If the Coralogix endpoint is slow or down, the log push could eat into the `ctx.waitUntil` 30-second budget that the capture pipeline needs. **Recommendation:** Use `ctx.waitUntil` for log shipping (fire-and-forget), but with a short timeout (2-3 seconds). Logs are best-effort -- a failed log push must never block or fail a capture. If Coralogix is unreachable, drop the log silently (or buffer to a short-lived KV entry for retry, but that adds complexity -- YAGNI for MVP).

5. **No rate limiter on 404 path.** As noted above, the unmatched route path at `index.js:43-46` has no rate limiter. This is not just a log volume concern -- it is also a minor DoS vector (each 404 still requires route matching against all patterns). Low priority for MVP since the route table is small (O(7) patterns), but worth noting for the backlog.

6. **`console.warn` in capture.js should be replaced, not supplemented.** The existing `console.warn('WACZ bundling failed unexpectedly...')` on line 153 of `capture.js` should become a structured log event, not remain alongside a new structured event. Having both creates duplicate signals with different formats.

### Additional Agents Needed

None beyond those likely already involved. The security concerns are addressed by the recommendations above and can be implemented by the team handling the observability integration. The key decisions (HMAC vs. raw IP, what to include/exclude) are security architecture decisions that this contribution resolves -- they do not require a separate specialist.

If the team is unsure about GDPR implications of the HMAC-IP approach, that is a legal/compliance question outside the scope of any engineering agent.
