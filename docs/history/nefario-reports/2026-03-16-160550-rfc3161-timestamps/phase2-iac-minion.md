# IAC Minion: Capture Pipeline Latency and Graceful Degradation

## Recommendations

### 1. Expected TSA Latency from Cloudflare Edge

DigiCert and GlobalSign TSA endpoints are HTTP-based REST services hosted on
well-provisioned CDN infrastructure. Expected round-trip latencies from
Cloudflare edge:

- **DigiCert** (`http://timestamp.digicert.com`): 50-200ms typical. DigiCert's
  TSA uses Akamai CDN; Cloudflare edge to Akamai edge will be fast in most
  regions. Note the endpoint is HTTP (not HTTPS) -- this is standard for RFC
  3161 TSAs because the response is self-authenticating (signed by the TSA's
  certificate). The trust is in the signature, not the transport.

- **GlobalSign** (`http://timestamp.globalsign.com/tsa/r6advanced1`): 50-250ms
  typical. Slightly more variable because GlobalSign's TSA infrastructure has
  fewer edge locations.

- **FreeTSA** (`https://freetsa.org/tsr`): 200-1000ms. Single-server
  infrastructure, hosted in Europe. Unreliable for production use -- included
  only for completeness.

**Recommendation**: DigiCert. Lowest latency, highest availability, most widely
used TSA (used by most code-signing toolchains). The HTTP endpoint is fine --
RFC 3161 responses are self-authenticating via the embedded TSA certificate
chain.

**Key observation**: The TSA round-trip (50-200ms) is small relative to the
pipeline's other operations. The R2 uploads (3 concurrent PUTs for
screenshot/html/headers) typically take 20-80ms each. The WACZ build (SHA-256
hashing, ZIP assembly, Ed25519 signing) takes 10-50ms. The TSA fetch is in the
same order of magnitude as what's already there -- it's not a budget-breaker.

### 2. TSA Request Should Run Concurrently with R2 Upload

The current pipeline after browser navigation is:

```
browser render (up to 25s)
  |
  v
Promise.all([R2 puts])          -- 3 concurrent uploads: screenshot, html, headers
  |
  v
buildWacz()                     -- WARC build, signing, ZIP assembly
  |
  v
R2 put (WACZ)                   -- single upload
  |
  v
archiveSigningKey()             -- KV put
  |
  v
completeCapture()               -- KV put
```

The TSA request needs the bundleHash (it timestamps the hash of the signed
content). This means it CANNOT run concurrently with R2 uploads -- it depends
on buildWacz() completing, because the TSA request includes the hash that the
TSA signs.

Wait -- re-reading the RFC 3161 spec more carefully: the TSA timestamps a
hash that the requester provides. The question is WHICH hash to timestamp:

**Option A: Timestamp the bundleHash** (hash of datapackage.json canonical form).
This is what the Ed25519 signature signs. The TSA would attest "this hash
existed at time T." Sequential dependency: must run after buildWacz() computes
the bundleHash but before the WACZ ZIP is assembled (because the TSA response
token must be included in datapackage-digest.json inside the ZIP).

**Option B: Timestamp the WACZ file hash** (hash of the final ZIP bytes).
This would timestamp the complete archive. But this creates a chicken-and-egg
problem: the timestamp response would need to be stored outside the WACZ
(can't include a hash of the file inside the file).

**Option C: Timestamp the Ed25519 signature bytes**. The TSA attests "this
signature existed at time T." This is the standard countersignature pattern
in code signing.

**Recommendation: Option A -- timestamp the bundleHash.** This is the most
natural fit because:
- The bundleHash is already the signed payload (Ed25519 signs it)
- The TSA response can be stored alongside the self-signature in the
  `signatures` array in `datapackage-digest.json`
- Verification is straightforward: verify Ed25519 sig over bundleHash,
  then verify TSA token also covers bundleHash -- both attest the same
  content

**Pipeline placement**: The TSA request MUST be sequential after bundleHash
computation and BEFORE ZIP assembly. This means it lives inside `buildWacz()`,
between Step 8 (Ed25519 signing) and Step 9 (assembling datapackage-digest.json).

However, the TSA fetch CAN run concurrently with the first batch of R2
uploads (screenshot, html, headers) if we restructure slightly. Currently
`buildWacz()` is called after R2 uploads. If we split the flow:

```
browser render (up to 25s)
  |
  v
buildWacz() starts              -- WARC, CDXJ, hashing, Ed25519 sign
  |                               + TSA fetch (bundleHash -> TSA -> token)
  |                               + ZIP assembly with TSA token
  v
Promise.all([
  R2 puts (screenshot, html, headers),   -- concurrent with WACZ build
  buildWacz() completion                  -- includes TSA round-trip
])
  |
  v
R2 put (WACZ)
  |
  v
completeCapture()
```

This is the optimal arrangement: the TSA round-trip overlaps with R2 uploads
rather than adding sequentially. The R2 uploads don't depend on WACZ output,
and the WACZ build doesn't depend on R2 uploads.

**Net latency impact**: If the TSA responds in 100ms and R2 uploads take 80ms,
the concurrent approach adds ~20ms of net wall-clock time vs. the current
pipeline. If TSA is slower (200ms), the net addition is ~120ms. Either way,
well within budget.

### 3. TSA Fetch Timeout

**Recommended timeout: 3000ms (3 seconds).**

Rationale:

- After a full 25s navigation, ~5s remain for post-render work. Current
  post-render operations (3x R2 PUT + WACZ build + WACZ R2 PUT + 2x KV PUT)
  consume roughly 200-500ms.

- After a fast navigation (e.g., 5s for a simple page), ~25s remain. Budget
  is not a concern.

- The worst case is a navigation that takes the full 25s (near-timeout). In
  this case, 5s remain, and current post-render ops need ~500ms. A 3s TSA
  timeout leaves 1.5s for the remaining KV operations, which is comfortable.

- For partial captures (timeout at 25s + 2s partial capture budget), the
  pipeline skips WACZ entirely (`if (!partial)`), so the TSA timeout is
  irrelevant -- no WACZ means no TSA request.

- 3s is generous for a TSA that typically responds in 50-200ms. If the TSA
  hasn't responded in 3s, it's likely experiencing an outage, and waiting
  longer won't help.

**Implementation**:

```js
const TSA_TIMEOUT_MS = 3000;

const tsaResponse = await fetch(tsaUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/timestamp-query' },
  body: tsaRequestDer,
  signal: AbortSignal.timeout(TSA_TIMEOUT_MS),
});
```

**Interaction with existing timeouts**:
- `NAV_TIMEOUT_MS` (25s): No interaction. Navigation completes (or times out
  into partial capture) before TSA is ever called.
- `HEADER_FETCH_TIMEOUT_MS` (10s): No interaction. Header fetch runs
  concurrently with navigation, not with WACZ/TSA.
- `PARTIAL_SCREENSHOT_TIMEOUT_MS` (3s) / `PARTIAL_CONTENT_TIMEOUT_MS` (1s):
  No interaction. Partial capture path skips WACZ entirely.
- `ctx.waitUntil()` 30s hard limit: The TSA timeout (3s) is safely within
  the remaining budget after navigation. Even in the worst case (25s nav +
  500ms R2 + 3s TSA timeout + 500ms remaining KV), total is 29s -- within
  the 30s limit.

**Adaptive timeout consideration (REJECTED)**: An adaptive timeout that
calculates remaining budget and adjusts the TSA timeout accordingly would
be more precise but violates KISS. Fixed 3s is simple, predictable, and
sufficient. If the pipeline ever exceeds 30s, the fix is queue migration
(R16), not a cleverer timeout.

### 4. Graceful Degradation: `timestamp: absent`

The current flow already has the right pattern. WACZ bundling degrades
gracefully (signing key absent -> return null, WACZ build throws -> capture
still completes). The TSA should follow the same pattern.

**Recommended approach: TSA fetch wrapped in try/catch inside `buildWacz()`**.

The TSA round-trip is attempted after Ed25519 signing. If it fails for any
reason (timeout, network error, malformed response, non-200 status), the
WACZ is still assembled and returned -- but with `timestamp: 'absent'` (or
no `rfc3161` entry in the signatures array) to indicate the TSA was
unreachable.

```js
// Inside buildWacz(), after Ed25519 signing, before ZIP assembly:
let tsaToken = null;
if (env.TSA_URL) {
  try {
    tsaToken = await requestTimestamp(env.TSA_URL, bundleHash);
  } catch {
    // TSA unreachable -- capture continues without timestamp
    // Caller logs the absence (capture.js already logs waczStatus)
  }
}
```

The `datapackage-digest.json` signatures array would then look like:

```json
{
  "signatures": [
    {
      "type": "self",
      "hash": "sha256:...",
      "signature": "...",
      "publicKey": "...",
      "keyId": "...",
      "created": "...",
      "software": "WRL/0.1"
    },
    {
      "type": "rfc3161",
      "status": "present",
      "token": "<base64 DER-encoded TimeStampToken>"
    }
  ]
}
```

When TSA is unreachable, the `rfc3161` entry is simply omitted from the
array (rather than including a `status: "absent"` entry). This is cleaner:
absence means "not attempted or not available." The verification pipeline
checks whether an `rfc3161` entry exists -- if it does, verify it; if not,
report `timestamp: "skipped"` in the verification response.

**Why omit rather than include `status: absent`?** Because the WACZ file is
an archive meant to be verified independently. Embedding "I tried and
failed to get a timestamp" is operator metadata that doesn't help a
verifier. The verifier sees: self-signature present (verify it), rfc3161
entry present or absent (verify if present, note absence if not).

**Capture-level logging**: The existing `capture.success` log event already
includes `waczStatus: 'ok' | 'skipped'`. Extend this to include
`timestampStatus: 'present' | 'absent' | 'skipped'` where:
- `present`: TSA responded, token embedded
- `absent`: TSA unreachable or error
- `skipped`: WACZ itself was skipped (partial capture or no signing key)

This gives Coralogix visibility into TSA reliability without any additional
logging infrastructure.

### 5. TSA URL Configuration: `[vars]` in wrangler.toml

**Recommendation: `[vars]` in wrangler.toml, not a `wrangler secret`.**

Rationale:
- The TSA URL is not a secret. It's a well-known public endpoint.
- Having it in `[vars]` makes it visible in source control, which is
  desirable for operational transparency.
- It allows different TSA endpoints per environment (production vs. staging)
  without `wrangler secret put` commands.
- It follows the existing pattern: `CORALOGIX_ENDPOINT` and
  `APPLICATION_NAME` are already in `[vars]`.

**Configuration**:

```toml
[vars]
TSA_URL = "http://timestamp.digicert.com"

[env.staging.vars]
TSA_URL = "http://timestamp.digicert.com"
```

Both production and staging use the same DigiCert TSA -- there's no
"staging TSA." The TSA is an external public service that doesn't know or
care about our environments.

**Omit to disable**: If `TSA_URL` is not set (or empty), skip the TSA
request entirely. This makes the feature opt-in during development and
easy to disable if DigiCert goes down and we need an emergency bypass.
Pattern: `if (env.TSA_URL) { ... }` -- same as the existing
`if (!env?.SIGNING_KEY) return null` pattern in `getSigningKeys()`.

**Variable naming**: `TSA_URL` (not `RFC3161_URL` or `TIMESTAMP_URL`).
TSA is the standard term; anyone familiar with timestamping will
recognize it immediately.

## Proposed Tasks

From the iac-minion perspective, the implementation work is:

1. **Add `TSA_URL` to wrangler.toml** -- `[vars]` and `[env.staging.vars]`,
   value `http://timestamp.digicert.com`. Trivial configuration change.

2. **Restructure capture.js to run R2 uploads concurrently with WACZ build** --
   Move the `buildWacz()` call to run in `Promise.all()` alongside the R2
   artifact uploads. This is a code change in `capture.js` that reduces
   net latency for the TSA round-trip to near-zero in the common case.
   Note: this is optional but recommended. Even without concurrency, the
   3s TSA timeout fits within the budget.

3. **Pass `env` to `buildWacz()` for TSA_URL access** -- Already done: the
   current signature is `buildWacz(url, captureDate, waczArtifacts, env)`.
   The `env` object is already passed, and `buildWacz` already reads
   `env.SIGNING_KEY` via `getSigningKeys(env)`. Adding `env.TSA_URL`
   requires no signature change.

4. **Add TSA timeout constant** -- `TSA_TIMEOUT_MS = 3000` in the TSA
   module (not in capture.js -- the TSA module owns its timeout, just as
   capture.js owns `NAV_TIMEOUT_MS`).

5. **Extend capture logging** -- Add `timestampStatus` field to
   `capture.success` and `capture.partial` log events.

## Risks and Concerns

### TSA Availability as a New External Dependency

The capture pipeline currently depends only on Cloudflare services (Browser
Rendering, R2, KV). Adding a DigiCert dependency introduces a failure mode
outside Cloudflare's SLA. Mitigation: graceful degradation (captures succeed
without timestamp). Monitoring: `timestampStatus: absent` in Coralogix logs
provides a real-time signal. If absence rate exceeds 5%, investigate and
consider a fallback TSA.

The backlog already has a parking lot item for multiple TSA redundancy:
"[consider] Multiple TSAs for redundancy -- 6+ months after R11 ships; based
on observed TSA reliability." This is correct -- don't pre-build redundancy.

### HTTP (not HTTPS) TSA Endpoint

DigiCert's RFC 3161 endpoint is `http://` (not `https://`). This is
industry-standard because the TSA response is cryptographically signed --
the trust is in the TSA's signature, not transport encryption. However:

- Cloudflare Workers `fetch()` to HTTP endpoints works fine -- no issues.
- A network-level MITM could inject a fake TSA response, but verification
  will catch this (the TSA's certificate chain validates the response, not
  the transport).
- If security-minion flags this as a concern, DigiCert also offers an HTTPS
  endpoint. The latency difference is negligible.

### 30s `ctx.waitUntil()` Hard Limit

The 30s limit is a Cloudflare Workers platform constraint. The current
pipeline already operates close to this limit in worst-case scenarios (25s
navigation timeout). Adding 3s TSA timeout theoretically pushes worst-case
to 29s. In practice:

- If navigation takes 25s, partial capture kicks in and skips WACZ entirely
  (no TSA request needed).
- Full WACZ path only runs after successful navigation, which in the timeout
  scenario completed within 25s. Post-navigation work (R2 + WACZ + TSA + KV)
  has 5s. With concurrent R2/WACZ, the TSA round-trip is overlapped.

The real risk is not the TSA timeout itself but cumulative slowness in
R2/KV/TSA all being slow simultaneously. This is the same risk that exists
today with R2/KV, and the mitigation is the same: if it becomes a problem,
R16 (queue migration) is the fix.

### No Retry on TSA Failure

The pipeline should NOT retry TSA requests. A single attempt with a 3s
timeout. Retries consume budget that the pipeline can't afford, and the
graceful degradation path (capture without timestamp) is acceptable. If
the TSA is having transient issues, the next capture will try again.

## Additional Agents Needed

No additional agents needed beyond what the meta-plan already includes.
The iac concerns are fully addressed by this contribution, and the
cross-cutting concerns (security for TSA trust model, api-design for
format, margo for YAGNI/ASN.1, frontend for UI) are already planned.

One note for **security-minion**: confirm whether DigiCert's HTTP endpoint
is acceptable or if HTTPS should be preferred. The security implications are
minimal (TSA response is self-authenticating), but security-minion should
make the call.

One note for **api-design-minion**: the recommendation here is to OMIT the
`rfc3161` entry from the signatures array when the TSA is unreachable,
rather than including a `status: absent` marker. This has implications for
the verification response design (how to report "no timestamp" vs.
"timestamp present and valid" vs. "timestamp present but invalid").
