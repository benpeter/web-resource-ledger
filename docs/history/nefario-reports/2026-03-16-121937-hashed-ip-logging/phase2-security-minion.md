## Domain Plan Contribution: security-minion

### Recommendations

#### Issue #36: HMAC-SHA256 IP Hashing

**1. Cryptographic Soundness of the Scheme**

The proposed scheme is `HMAC-SHA256(date + secret_seed, ip)`. This is
cryptographically sound but the parameter ordering matters. The standard
HMAC construction is `HMAC(key, message)`. The implementation should be:

```
key = HMAC-SHA256(secret_seed, date_string)   // derive daily key
hash = HMAC-SHA256(daily_key, ip_string)       // hash the IP
```

Using a two-step derivation (secret_seed -> daily_key -> ip_hash) is
better than concatenating `date + secret_seed` as a single key because:
- It follows the standard HKDF-like pattern of "extract then expand"
- It cleanly separates the temporal component from the secret material
- The daily_key can be held in memory for the duration of the day without
  re-reading the secret seed on every request

**2. Rainbow Table Resistance on the ~4B IPv4 Space**

The IPv4 address space is only 2^32 (~4.3 billion) addresses. Without
keying, a SHA-256 hash of an IP address can be reversed by precomputing
all possible hashes in about 15 minutes on commodity hardware. This is
why the HMAC keying is essential, not optional.

With a properly random 256-bit secret seed and daily key rotation via
HMAC derivation, an attacker who obtains logged hashes cannot reverse
them without the secret seed. The effective security margin is the
entropy of the secret seed (256 bits), not the entropy of the IP space
(32 bits).

**Threat scenarios to address:**
- **Secret seed compromise**: If the seed leaks, ALL historical hashes
  across ALL days become reversible (the date is public, so all daily keys
  can be re-derived). Mitigation: the secret seed must be a Cloudflare
  Worker secret (not a var), rotated if compromise is suspected, and
  never logged.
- **Coralogix log exfiltration + seed compromise**: Combined compromise
  reveals all IPs. This is the inherent risk of pseudonymized data. The
  daily rotation limits the correlation window (attacker must also know
  the date of each log entry, which they do if they have the logs).
- **Without the seed**: The hashes are computationally irreversible. An
  attacker with only the logs can see that hash_X appears 50 times on
  2026-03-16, but cannot determine the IP.

**Verdict**: The scheme is sufficient against rainbow tables as long as
the secret seed is properly random (minimum 256 bits of entropy) and
stored as a Worker secret.

**3. Separate Secret vs. Derived from SIGNING_KEY**

**Use a separate secret.** Reasons:

- **Key purpose separation**: SIGNING_KEY is an Ed25519 private key used
  for WACZ bundle signing. The IP hashing seed serves a completely
  different purpose (pseudonymization). Cryptographic best practice is
  one key per purpose.
- **Rotation independence**: The SIGNING_KEY has its own rotation lifecycle
  tied to key versioning (R2). The IP hash seed should rotate on a
  completely different schedule (only on suspected compromise, since daily
  derivation already provides temporal separation).
- **Blast radius**: If SIGNING_KEY leaks, the attacker can forge WACZ
  signatures. If the IP hash seed leaks, the attacker can reverse IP
  hashes. These are different threats with different response procedures.
  Coupling them means one compromise triggers both response plans.
- **SIGNING_KEY is PKCS8 DER**: It is not a raw symmetric key. Using it
  as an HMAC key would require extracting raw bytes from the PKCS8
  encoding, which is fragile and semantically wrong.

Recommendation: Add a new Worker secret `IP_HASH_SEED` -- a 256-bit
random value, base64-encoded. Generate with:
`openssl rand -base64 32`

**4. GDPR Art. 4(5) Pseudonymization Analysis**

Yes, the hashed IP is pseudonymized data under GDPR, not anonymized data.

GDPR Art. 4(5) defines pseudonymization as processing that renders
personal data no longer attributable to a specific data subject "without
the use of additional information" -- where that additional information
is kept separately and subject to technical and organizational measures.

The hashed IP meets this definition precisely:
- The hash alone cannot identify a person
- The secret seed (additional information) can reverse the pseudonymization
- The seed is stored separately (Cloudflare secret, not in the logs)

**Implications**:
- Pseudonymized data is still personal data under GDPR. It remains subject
  to data minimization, storage limitation, and purpose limitation.
- However, pseudonymization is explicitly encouraged by GDPR (Recital 28,
  Art. 25, Art. 32) as a safeguard. Using it is a positive compliance
  signal, not a compliance burden.
- The daily key rotation adds a proportionality argument: correlation is
  limited to same-day, which is the minimum needed for abuse detection.
- **Data retention**: The hashed IPs in Coralogix logs should have a
  defined retention period. Recommend 90 days maximum for abuse
  correlation. Coralogix supports per-subsystem retention policies.
- **Legal basis**: Legitimate interest (Art. 6(1)(f)) for abuse prevention
  is the appropriate legal basis. The pseudonymization and daily rotation
  support the balancing test (data subject rights vs. controller interest).

**5. Scope of Hashing: All Events vs. Capture-Only**

**Hash IP for ALL log events that currently carry or could carry IP-derived
information.** Specifically:

- `security.auth_fail` -- already exists, currently logs no IP. SHOULD add
  hashed IP (abuse correlation for brute-force attempts).
- `security.rate_limit` -- rate limit key is `CF-Connecting-IP`. SHOULD
  add hashed IP (enables spotting distributed rate-limit abuse).
- `security.ssrf_block` -- SHOULD add hashed IP (SSRF probing patterns).
- `security.capacity_limit` -- no IP currently, COULD add for capacity
  abuse detection but lower value.
- `capture.stage.fail`, `capture.success`, `capture.fail` -- SHOULD add
  hashed IP (correlate capture failures with abusive IPs).
- `capture.header_fail`, `capture.wacz_fail`, `capture.key_archive_fail`
  -- lower value, but for consistency, include them.
- `list.success`, `list.error` -- SHOULD add hashed IP (detect listing
  enumeration abuse).

**Do NOT log the raw IP in Coralogix.** The raw IP currently exists only
in KV records (stored by `createCapture()`). That is a separate concern
from the logging issue and is explicitly out of scope per #36.

**Implementation pattern**: The `log()` function signature should NOT be
changed to accept IP directly (that would violate its invariant about
attacker-controlled input). Instead, the hashing should happen BEFORE
the data reaches `log()`. Either:
- (a) Compute the hashed IP once per request in the fetch handler and
  pass it alongside other context, or
- (b) Create a `hashIP(env, ipString)` helper that callers invoke before
  constructing the log data object.

Option (a) is cleaner -- compute once, use everywhere. The fetch handler
already has access to `CF-Connecting-IP` and `env`.

**6. Secret Availability and Graceful Degradation**

If `IP_HASH_SEED` is not configured (local dev, preview environments),
the hashed IP field should be omitted from logs, not replaced with a
plaintext IP or a placeholder. This follows the same pattern as
`CORALOGIX_SEND_KEY` (logging no-ops when not configured).

---

#### Issue #52: Logging Raw Playwright Error Messages

**7. Safety of Logging error.message from Playwright**

This requires careful analysis. Playwright's `error.message` strings can
contain:

- **Target URLs**: Navigation errors include the URL that failed (e.g.,
  `"net::ERR_NAME_NOT_RESOLVED at https://attacker.example.com/..."`).
  The target URL is already logged as `url` in other fields and is
  caller-controlled input -- but it has passed `validateUrl()` so it is
  a valid, public, SSRF-checked URL. Logging it again inside the error
  message is acceptable.
- **Internal error details**: Playwright can include CDP session IDs,
  internal page addresses (`page@12345`), and process IDs. These are
  Cloudflare infrastructure details. Low sensitivity -- they are ephemeral
  and scoped to the Worker invocation.
- **Stack traces**: The error object's `.stack` property can include file
  paths and line numbers. The `.message` property typically does not
  include stack traces, but some Node.js error subclasses embed partial
  traces. The proposal correctly limits to `.message` and `.name`, not
  `.stack`.
- **User data from page content**: Playwright errors from `page.evaluate()`
  or content interaction could theoretically include page content. In WRL's
  case, the only `page.evaluate()` call is
  `page.evaluate(() => document.body.scrollHeight)` which returns a number.
  No user-controlled content flows into error messages from this path.

**Verdict**: Logging `error.message` and `error.name` is safe for this
codebase. The risk is minimal because:
1. The message does not contain PII (no user accounts, no credentials)
2. The target URL is already a validated, public URL
3. No page content flows into evaluate() error paths
4. Infrastructure details (session IDs) are low-sensitivity and ephemeral

**However**, the log invariant in `log.js` states: "data must contain only
static values and predetermined strings, never attacker-controlled input."
The raw `error.message` from Playwright is not attacker-controlled in the
traditional sense (an attacker cannot inject arbitrary text into Playwright
error messages), but it is also not a "predetermined string." The invariant
comment should be updated to clarify: "Error messages from internal
framework calls (Playwright, fetch) are acceptable when the framework
does not echo user-supplied content into its error strings."

**8. Log Field Naming**

Use `rawError` and `rawErrorName` (or `errorMessage` and `errorName`) as
field names to distinguish from the existing `errorCategory` field. This
makes it clear in Coralogix queries which field is the sanitized category
and which is the raw framework error.

**9. Catch-All Path (Line 180-182)**

The catch-all at line 180 currently logs `errorClass: err?.constructor?.name`.
Adding `err?.message` here is acceptable for the same reasons as above.
However, this catch-all covers truly unexpected errors -- if a dependency
throws an error containing sensitive content, it would be logged. The risk
is low given the dependency tree (Playwright, R2, KV) but worth noting.

Recommendation: Log `err?.message` in the catch-all, but truncate to 200
characters to limit blast radius: `err?.message?.slice(0, 200)`.

### Proposed Tasks

**T1: Create IP_HASH_SEED Worker secret**
- Generate: `openssl rand -base64 32`
- Store: `wrangler secret put IP_HASH_SEED` (production and staging)
- Document in wrangler.toml comments alongside other secrets

**T2: Implement hashIP() helper**
- Location: new function, likely in a `src/ip-hash.js` module or within
  `src/log.js`
- Two-step derivation:
  1. `dailyKey = HMAC-SHA256(IP_HASH_SEED, YYYY-MM-DD)`
  2. `hashedIP = HMAC-SHA256(dailyKey, ip_string)`
- Use `crypto.subtle.sign('HMAC', ...)` with imported key
- Cache the daily key (same date -> same key, avoid re-importing on every
  call)
- Return hex-encoded truncated hash (first 16 hex chars is sufficient for
  correlation; full 64 hex chars is unnecessary and wastes log storage)
- Graceful degradation: return `undefined` if `IP_HASH_SEED` is absent

**T3: Integrate hashed IP into log events**
- Compute hashed IP once per request in the `fetch()` handler
- Pass it through to `performCapture()` and all log call sites
- Add `ipHash` field to all security and capture log events
- Preserve existing log structure (new field, not replacement)

**T4: Update categorizeError() and log calls for issue #52**
- Add error patterns: `"Could not acquire"`, `"session limit"`,
  `"ERR_CONNECTION_REFUSED"`, `"Worker.fetch() took too long"`
- Log `rawError: error?.message, rawErrorName: error?.name` alongside
  `errorCategory` in `capture.stage.fail` events
- Log `rawError: err?.message?.slice(0, 200)` in the catch-all path
- Update the invariant comment in `log.js`

**T5: Write tests**
- Unit test `hashIP()`: same IP + same day = same hash, same IP +
  different day = different hash, different IP + same day = different hash
- Unit test: `hashIP()` returns undefined when seed is absent
- Test that `categorizeError()` matches new Playwright error patterns
- Test that raw error fields appear in log data for stage failures

### Risks and Concerns

**R1: Clock skew at day boundaries**
When a request arrives at 23:59:59.999 UTC and the log event fires at
00:00:00.001 UTC, the daily key will differ. Two log entries from the same
request could have different hashes. Mitigation: derive the date string
once per request (at entry time in the fetch handler), not per log call.

**R2: Secret seed rotation procedure not defined**
If `IP_HASH_SEED` is compromised, there is no documented procedure for
rotation. Unlike SIGNING_KEY (which has key versioning), the IP hash seed
has no versioning -- rotating it simply breaks correlation across the
boundary. This is acceptable (old hashes become orphaned, which is fine
for abuse detection), but should be documented.

**R3: IPv6 normalization**
`CF-Connecting-IP` may return IPv6 addresses in various representations
(e.g., `::ffff:1.2.3.4` vs `::ffff:102:304`). Different string
representations of the same IP would produce different HMAC hashes. The
implementation MUST normalize the IP string before hashing. Use the
existing `parseIPv4()` for IPv4 addresses; for IPv6, normalize to a
canonical lowercase expanded form. Alternatively, hash the raw bytes
of the IP address (parsed to 4 or 16 bytes) rather than the string.

This is the highest-risk implementation concern. If IPv6 normalization
is wrong, the same client will produce different hashes across requests,
defeating the correlation purpose.

**R4: Log volume and Coralogix cost**
Adding `ipHash` to every log event increases payload size by ~20-70 bytes
per event. With the current traffic volume this is negligible, but worth
noting.

**R5: The raw IP remains in KV**
The `createCapture()` function stores the raw IP in the KV record
(`value.ip`). Issue #36 explicitly excludes this from scope ("not
replacement of raw IP in KV"). This is fine for now -- the KV record is
not exposed via the API (handleGetCapture and handleListCaptures strip
it). But it means the system still has raw IP stored in KV alongside
hashed IP in logs. Future work should assess whether the KV raw IP is
still needed after hashed logging is in place.

**R6: Playwright error messages could change between versions**
The error pattern matching in `categorizeError()` is string-based and
coupled to Playwright's internal error message format. If `@cloudflare/
playwright` updates change the error message strings, patterns will stop
matching and errors will fall through to the catch-all again. This is
acceptable because the new raw error logging (issue #52) ensures the
actual message is always visible regardless of whether categorization
matches.

### Additional Agents Needed

No additional agents are needed beyond those already involved. The tasks
are implementation-focused and fit within the existing team:

- **Implementation**: The coding work (hashIP helper, log integration,
  categorizeError patterns) is standard JavaScript/Workers development.
- **Testing**: test-minion can handle the unit tests once the
  implementation tasks are defined.
- **Infrastructure**: The only infrastructure change is
  `wrangler secret put IP_HASH_SEED`, which is trivial.

One consideration: if there is an **observability-minion** involved, they
should be consulted on Coralogix field naming conventions and whether the
`ipHash` field should be added to any existing Coralogix dashboards or
parsing rules. But this is not blocking for the implementation.
