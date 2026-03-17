# Domain Plan Contribution: api-design-minion

## Planning Question

How should the CLI resolve the operator's Ed25519 public key for signature
verification across remote and local workflows?

## Recommendations

### 1. Two distinct trust levels, transparent to the user

The fundamental tension here is that the WACZ is a self-contained evidence
package, but the embedded public key is self-asserted. In the Worker's
security model (verify.js lines 17-20), the public key NEVER comes from the
WACZ -- it comes from server-controlled state (KV record -> archived key ->
current key). The CLI cannot replicate this model because it does not have
access to KV. Instead, the CLI should offer two distinct trust levels and
make the trust basis explicit in the output.

**Trust Level 1 -- Origin-verified (high trust):** The signing key is
fetched from the same origin that produced the capture (or from an
operator-specified origin). The CLI resolves the key from
`/.well-known/signing-keys` using the `keyId` embedded in the WACZ,
falling back to `/.well-known/signing-key` if the keyId endpoint is
unavailable. This is the closest analogue to what the Worker does: key
comes from the operator's infrastructure, not from the WACZ itself.

**Trust Level 2 -- Key-pinned (explicit trust):** The user supplies a key
directly via `--key <base64>` or `--key-file <path>`. The CLI verifies
against this key without network access. The user is asserting "I know the
correct key." This is the offline mode.

**Trust Level 3 (rejected) -- Embedded key (self-asserted):** Using the
key embedded in the WACZ. This is explicitly rejected as a default because
it defeats the purpose of signature verification. An attacker who can
modify the WACZ can replace both the signature and the embedded key. This
should never be the default behavior and should never silently succeed.

### 2. Default behavior by input type

**Remote verification (`npx @wrl/verify https://.../v1/verify/cap_xxx`):**

The URL contains the origin. The CLI should:
1. Parse the origin from the URL
2. Fetch the WACZ from `/v1/captures/{id}/artifacts/wacz`
3. Extract `keyId` from `datapackage-digest.json`
4. Fetch the key from `{origin}/.well-known/signing-keys` and match by `keyId`
5. Fall back to `{origin}/.well-known/signing-key` if the keys endpoint
   returns no match
6. Verify using the fetched key

This should be fully automatic with no flags required. The origin is
inherent in the URL the user provided. The output should state the trust
basis: "Key source: https://wrl.benpeter.workers.dev/.well-known/signing-keys
(keyId: a1b2c3d4)".

**Local verification (`npx @wrl/verify capture.wacz`):**

No origin is available. The CLI MUST require one of:
- `--origin <url>` -- fetches the key from the specified origin's
  `/.well-known/signing-keys` (using keyId from WACZ) or
  `/.well-known/signing-key`
- `--key <base64>` -- uses the provided raw public key directly
- `--key-file <path>` -- reads a PEM or raw base64 key from a file

If none of these is provided, the CLI should print an error explaining
why the embedded key cannot be trusted and show the available options.
The error message should be actionable:

```
Error: No signing key source specified for local verification.

The WACZ file contains an embedded public key, but using it would be
insecure -- an attacker who modifies the capture can also replace the
embedded key.

Specify one of:
  --origin https://wrl.benpeter.workers.dev  Fetch key from the operator
  --key <base64>                             Provide key directly
  --key-file <path>                          Read key from file

The embedded keyId is: a1b2c3d4
```

This is the correct default because:
1. It fails closed -- no verification succeeds without a trusted key source
2. The error message educates the user about why the embedded key is insufficient
3. It matches the Worker's own security model ("NEVER trust the embedded key")
4. It provides the keyId so the user can decide how to resolve the key

### 3. Key resolution via `/.well-known/signing-keys` with keyId matching

The CLI should prefer the `/.well-known/signing-keys` endpoint over
`/.well-known/signing-key` when a `keyId` is present in the WACZ.

**Why:** The `signing-keys` endpoint returns all historical keys with their
keyIds. If the operator has rotated keys, the current key from `signing-key`
will not verify captures signed with the old key. The keyId in the WACZ
identifies which key was used at signing time -- matching against the
archive is the correct approach.

**Resolution algorithm:**
1. Extract `keyId` from `signedData.signatures[type="self"].keyId`
2. Fetch `{origin}/.well-known/signing-keys`
3. Find the entry where `keyId` matches
4. If found, use that key
5. If not found, fetch `{origin}/.well-known/signing-key` as fallback
   (covers the case where the key archive is incomplete or the endpoint
   is missing)
6. If the fallback key's `keyId` matches the WACZ's `keyId`, use it
7. If no match, fail with "Key not found for keyId: {id}"

This mirrors the Worker's priority in `handleVerifyCapture` (index.js lines
450-467): KV record keyId -> archived key -> current key fallback.

### 4. The `--origin` flag design

```
--origin <url>    WRL instance URL for key resolution
                  (default: derived from input URL for remote verification)
```

The `--origin` flag should accept a bare origin (scheme + host + optional
port): `https://wrl.benpeter.workers.dev`. The CLI appends the well-known
paths itself.

For remote verification, `--origin` should override the auto-derived origin.
This handles the case where someone has a verify URL for one instance but
wants to verify against a different instance's key (unusual, but not
impossible in a fork scenario).

### 5. Explicit `--trust-embedded` escape hatch (not recommended but available)

For truly offline scenarios where no origin is reachable and no key file is
available, provide `--trust-embedded` as a last resort. When used:
- The CLI uses the embedded `publicKey` from `datapackage-digest.json`
- The output prominently warns: "WARNING: Verification used the
  self-asserted key embedded in the WACZ. This proves internal consistency
  only -- not that the capture was produced by a trusted operator."
- The exit code is still 0 if all checks pass (the signature IS valid
  against that key), but the output makes the trust limitation clear
- The JSON output includes a `trustBasis: "embedded"` field (vs
  `trustBasis: "origin"` or `trustBasis: "pinned"`)

This is the correct approach because:
- It makes the trade-off explicit rather than hiding it
- Some users genuinely need offline self-consistency checks
- The warning prevents false confidence
- It requires an explicit opt-in flag, so no one stumbles into it

### 6. Key response caching

When verifying multiple WACZ files in sequence (batch mode, if supported),
the CLI should cache the `/.well-known/signing-keys` response in memory
for the duration of the process. The endpoint returns
`Cache-Control: public, max-age=3600` which confirms the keys are stable
enough to cache.

Do not cache to disk. The CLI is a verification tool; caching key material
to the filesystem introduces a new attack surface without meaningful benefit
for a tool that runs for seconds.

### 7. Trust basis in output and JSON

Every verification result must include the trust basis so the consumer
understands what the signature check actually proved.

**Human output:**
```
Signature     PASS  (key: a1b2c3d4 from wrl.benpeter.workers.dev)
```
or
```
Signature     PASS  (key: a1b2c3d4, user-provided)
```
or
```
Signature     PASS  (key: a1b2c3d4, EMBEDDED -- self-asserted only)
```

**JSON output:**
```json
{
  "checks": [...],
  "keyResolution": {
    "keyId": "a1b2c3d4",
    "source": "origin",
    "origin": "https://wrl.benpeter.workers.dev",
    "endpoint": "/.well-known/signing-keys"
  }
}
```

or for pinned keys:
```json
{
  "keyResolution": {
    "keyId": "a1b2c3d4",
    "source": "pinned",
    "method": "--key"
  }
}
```

### 8. Network error handling

When the CLI attempts to fetch a signing key and the request fails (network
error, DNS failure, non-2xx response):

- Print the error with the URL that failed
- Suggest `--key` or `--key-file` as alternatives
- Do NOT fall back to the embedded key automatically
- Exit with an error code (not a verification failure -- a tool failure)

Distinguish between "verification failed" (exit 1) and "tool could not run"
(exit 2). A network error fetching the key is exit 2, not exit 1.

## Proposed Tasks

1. **Implement key resolution module** (`packages/verify/src/key-resolution.js`)
   - Fetch from `/.well-known/signing-keys` with keyId matching
   - Fetch from `/.well-known/signing-key` as fallback
   - Parse `--key` base64 and `--key-file` path inputs
   - Extract embedded key (for `--trust-embedded` mode)
   - Return structured `{ publicKeyBytes, keyId, trustBasis, source }` object

2. **Implement CLI argument parsing for key flags**
   - `--origin <url>` -- operator origin URL
   - `--key <base64>` -- raw public key
   - `--key-file <path>` -- key file path
   - `--trust-embedded` -- use embedded key with warning
   - Mutual exclusivity validation: only one key source at a time
   - For remote URLs: auto-derive origin, allow `--origin` override

3. **Add trust basis to verification output**
   - Human-readable: trust source displayed alongside signature check result
   - JSON: `keyResolution` object in output
   - Warning text for `--trust-embedded` mode

4. **Error messages for missing key source on local verification**
   - Actionable error showing all options
   - Include embedded keyId for reference

5. **Integration tests for key resolution**
   - Remote URL: mock `/.well-known/signing-keys` endpoint, verify keyId match
   - Remote URL: fallback to `/.well-known/signing-key` when keys endpoint
     returns no match
   - Local file with `--origin`: same key fetch flow
   - Local file with `--key`: direct key use, no network
   - Local file with `--trust-embedded`: embedded key with warning
   - Local file with no key flag: actionable error
   - Network failure: correct error message and exit code
   - Key rotation scenario: WACZ signed with old key, keys endpoint
     returns archive including old key

## Risks and Concerns

### Risk 1: `/.well-known/signing-keys` endpoint does not support keyId lookup

The current `handleGetSigningKeys` endpoint (index.js line 557) returns all
archived keys as an array. It does not support `?keyId=...` filtering or a
`/.well-known/signing-keys/{keyId}` sub-resource. The CLI must fetch the
full list and filter client-side. This is fine for a "single-digit over
service lifetime" key count (kv.js line 10), but the CLI should handle the
case where the list is empty (no keys have been archived yet -- only the
current key exists).

**Mitigation:** Implement the fallback chain as described: keys endpoint ->
client-side keyId filter -> signing-key endpoint -> keyId comparison ->
fail.

### Risk 2: Legacy captures without keyId in signedData

v0.1.0 format captures (verify.js line 116, `signedData?.version ?? '0.1.0'`)
have `publicKey` directly on `signedData` with no `keyId` field. The WACZ
format also evolved -- the `keyId` field was added during key versioning
(R2 in the backlog). Captures created before R2 will not have a keyId in
the WACZ.

**Mitigation:** When no keyId is present in the WACZ, the CLI should:
- For remote: fetch `/.well-known/signing-key` (current key) directly
- For local: require `--key` or `--origin` (where `--origin` fetches
  the current key). Cannot use `--trust-embedded` if there is no keyId
  to match against, but the embedded publicKey can still be used with the
  warning.

### Risk 3: CORS on well-known endpoints

The `/.well-known/signing-key` and `/.well-known/signing-keys` endpoints
return `Access-Control-Allow-Origin: *` headers (index.js lines 552, 572).
This is important if the CLI is ever ported to browser use, but for the
Node.js CLI it is irrelevant. No risk here -- just noting it.

### Risk 4: Rate limiting on key endpoints

Both signing key endpoints are rate-limited via `VERIFY_RATE_LIMITER`
(index.js lines 537-543, 560-566). When running batch verification, the
CLI could hit rate limits when fetching keys. The endpoints return 429 with
`Retry-After: 60`.

**Mitigation:** In-memory caching of key responses for the process lifetime
eliminates this concern for single-origin batch verification. For
multi-origin verification, implement basic retry-after handling (wait and
retry once).

### Risk 5: Trust model complexity for end users

The three trust levels (origin-verified, key-pinned, embedded) add
cognitive overhead. Non-technical users (lawyers, journalists) may not
understand why they need to specify `--origin`.

**Mitigation:**
- For remote verification: fully automatic, no flags needed. This is the
  primary use case.
- For local verification: the error message explains the "why" in plain
  language. The `--origin` flag is the simplest option to communicate:
  "tell me where this capture came from."
- Documentation should lead with the remote verification example.

## Additional Agents Needed

None beyond those already planned. The key resolution design integrates
with:
- **security-minion**: The trust model aligns with the Worker's security
  posture. Security-minion should validate that the `--trust-embedded`
  escape hatch does not weaken the overall security story.
- **ux-strategy-minion**: The error messages and trust basis output are
  UX concerns. UX should validate that the "missing key source" error is
  clear enough for non-technical users.
- **devx-minion**: The `--key-file` flag needs to handle PEM format
  (common for key distribution) and raw base64. devx-minion should specify
  the accepted formats.

## Summary of Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Remote default | Auto-derive origin, fetch key | Origin is in the URL; no flag burden |
| Local default | Require `--origin` or `--key` | Fail closed; matches Worker security model |
| Key endpoint priority | `signing-keys` (keyId match) > `signing-key` (fallback) | Handles key rotation correctly |
| Embedded key | Opt-in via `--trust-embedded` with prominent warning | Available for offline use; prevents false confidence |
| Trust basis in output | Always visible in both human and JSON output | Consumer must understand what was proved |
| Network errors | Exit 2 (tool error), not exit 1 (verification failure) | Distinguishes "couldn't check" from "check failed" |
| Key caching | In-memory only, per-process | Avoids filesystem attack surface; adequate for CLI lifecycle |
