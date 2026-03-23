# Domain Plan Contribution: devx-minion

## Recommendations

### The Right Approach: Option (c) -- Enhance the verify endpoint with a tokenized WACZ URL

**Recommendation: Option (c), specifically: the public verify response should include a tokenized `waczUrl` field that grants time-limited, unauthenticated download access to the WACZ artifact.**

Here is the reasoning:

**Option (a) -- bake tokens into all artifact URLs** is operationally messy. The verify response currently has no artifact URLs at all (only `handleGetCapture` at `/v1/captures/{id}` returns those). Adding them to the verify response is essentially option (c). Adding share tokens to the capture detail response is redundant because the caller already has a tenant API key if they can see that response.

**Option (b) -- `--token` flag on the CLI** breaks the current zero-config experience for the most common use case. Today, `npx @w-r-l/verify https://wrl.benpeter.workers.dev/v1/verify/cap_abc123` just works. Requiring a token flag would mean the verifier needs to obtain a credential first, which defeats the purpose of third-party verification. The entire trust model of the verify CLI is that an independent third party can verify a capture without any relationship to the tenant.

**Option (c) is the clear winner because it preserves the CLI's zero-auth flow while securing tenant data.** The verify endpoint is already public by design (comment on line 1527 of index.js: "Public endpoint -- no authentication"). The CLI already uses the capture URL to derive the WACZ download URL (`fetchWaczFromCaptureUrl` in key-resolver.js, line 127-140). The change is surgical:

1. The verify endpoint response adds a `waczUrl` field containing a short-lived, signed URL that grants unauthenticated access to the WACZ artifact for that specific capture.
2. The CLI detects the `waczUrl` field when given a `/v1/verify/{id}` URL and uses it instead of constructing the artifact URL itself.
3. The WACZ download endpoint validates the token (HMAC signature, expiry, capture ID binding) and serves the artifact without tenant auth.

### Concrete DX Flow After This Change

**For the CLI user (verifier), nothing changes:**

```bash
# This still works exactly as before -- zero flags, zero config
npx @w-r-l/verify https://wrl.benpeter.workers.dev/v1/verify/cap_abc123
```

Under the hood, the CLI:
1. Detects `isWrlCaptureUrl` -- true (the pattern already matches `/v1/verify/` paths)
2. NEW: Before fetching the WACZ directly, hits `GET /v1/verify/{id}` (Accept: application/json) to get the verification result AND the `waczUrl`
3. Downloads the WACZ from the tokenized `waczUrl`
4. Runs local verification as before

**For the tenant (capture owner), share tokens provide explicit sharing:**

```bash
# Generate a share token for a specific capture
curl -X POST https://wrl.benpeter.workers.dev/v1/captures/cap_abc123/share \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"expiresIn": "7d"}'
# => { "token": "shr_...", "url": "https://wrl.../v1/captures/cap_abc123?token=shr_...", "expiresAt": "..." }

# Share the URL -- recipient can access capture detail + artifacts without an API key
curl https://wrl.benpeter.workers.dev/v1/captures/cap_abc123?token=shr_...
```

### Version Bump Analysis

**This requires a MINOR version bump (0.1.0 -> 0.2.0), not a major bump.** Here is why:

- **No existing behavior breaks.** The CLI currently constructs `{origin}/v1/captures/{captureId}/artifacts/wacz` and fetches it. After the auth gate, this URL returns 401 without auth. But the CLI is being updated in the same release to use the tokenized URL from the verify response instead. The new CLI version works against both old servers (falls back to direct fetch) and new servers (uses `waczUrl`).
- **The public API (verify endpoint) only adds fields, never removes them.** Adding `waczUrl` to the response is additive.
- **The old CLI version (0.1.0) will break against servers with the auth gate.** This is expected and acceptable because: (a) the fix is `npx @w-r-l/verify@latest`, which is the standard upgrade path for npx users who always get latest anyway, and (b) the verify endpoint itself still returns the correct `verified: true/false` -- the CLI just cannot do independent local re-verification without the WACZ.

However, the README and CHANGELOG must be explicit about this:
> **Upgrade notice:** `@w-r-l/verify` 0.2.0 is required for servers running the capture auth gate. If you see `HTTP 401 fetching .../artifacts/wacz`, upgrade with `npx @w-r-l/verify@latest`.

### CLI Implementation Details

The CLI change should follow this pattern in `key-resolver.js`:

```javascript
// In fetchWaczFromCaptureUrl:
// 1. If the URL matches /v1/verify/, hit the verify endpoint first
// 2. If the response includes waczUrl, use that
// 3. If not (old server), fall back to constructed URL (existing behavior)
```

The verify endpoint call serves double duty:
- Gets the tokenized WACZ download URL
- Pre-validates that the capture exists before downloading (fail-fast)

Error messages must be clear when things go wrong:

```
Error: HTTP 401 fetching https://wrl.../v1/captures/cap_abc123/artifacts/wacz

The server requires authentication for artifact downloads.
Update to the latest version: npx @w-r-l/verify@latest

If you are the capture owner, you can also download the WACZ
directly with your API key and verify the local file:
  npx @w-r-l/verify ./bundle.wacz --origin https://wrl...
```

### CLI Flag: No `--token` Flag Needed

Do NOT add a `--token` flag to the CLI. The tokenized URL from the verify endpoint handles the common case (third-party verification). For tenant-initiated verification of their own captures, the workflow is:

1. Download the WACZ with their API key: `curl -H "Authorization: Bearer $KEY" .../artifacts/wacz -o bundle.wacz`
2. Verify locally: `npx @w-r-l/verify ./bundle.wacz --origin https://wrl...`

This keeps the CLI argument surface minimal and avoids mixing authentication concerns into a verification tool.

## Proposed Tasks

### Task 1: Add waczUrl to verify endpoint response
- Server-side: when `handleVerifyCapture` builds the response body, generate a short-lived (15-minute) HMAC-signed download URL and include it as `waczUrl` in the JSON response
- The signed URL format: `/v1/captures/{id}/artifacts/wacz?token={hmac}&exp={epoch}`
- Token binds to: captureId + expiry timestamp + HMAC with server secret
- Only include `waczUrl` when verification passes (no point downloading a tampered WACZ)

### Task 2: Accept token query parameter on artifact endpoints
- In `handleGetCaptureArtifact`, check for `?token=` query parameter
- If present, validate HMAC signature and expiry instead of requiring tenant auth
- If token is valid and captureId matches, serve the artifact
- If token is expired, return 410 Gone with clear message
- If token is invalid, return 401 with clear message

### Task 3: Update CLI to use waczUrl from verify endpoint
- When given a WRL capture URL (matching `/v1/verify/` or `/v1/captures/`), first hit `GET /v1/verify/{captureId}` with `Accept: application/json`
- If response includes `waczUrl`, download WACZ from that URL
- If response does not include `waczUrl` (old server), fall back to existing behavior (construct URL directly)
- Handle 401 on direct WACZ fetch with actionable error message suggesting upgrade

### Task 4: CLI version bump and CHANGELOG
- Bump package.json from 0.1.0 to 0.2.0
- CHANGELOG entry under "Changed" explaining the new WACZ resolution flow
- README update noting server compatibility
- Upgrade notice for users seeing 401 errors

### Task 5: Share token endpoint and CLI backward compatibility
- `POST /v1/captures/{id}/share` creates a persistent share token stored in D1
- Share tokens are distinct from the short-lived HMAC artifact tokens (those are ephemeral, never stored)
- Share tokens grant access to GET capture detail + all artifacts
- This is the mechanism for tenants to share captures with external parties who need more than just the verify result

## Risks and Concerns

### Risk 1: Two token mechanisms could confuse developers
There are two distinct token types proposed: (a) ephemeral HMAC-signed artifact URLs (from verify endpoint, short-lived, never stored) and (b) persistent share tokens (from share endpoint, stored in D1, revocable). The API documentation must clearly distinguish these. The HMAC tokens are an implementation detail of the verify flow; share tokens are a user-facing feature.

**Mitigation:** Never expose HMAC token generation as a user-facing API. It is an internal mechanism of the verify endpoint. Only share tokens are user-visible. Different naming helps: query param `exp` + `sig` for HMAC tokens vs. `token` for share tokens.

### Risk 2: HMAC secret rotation
The HMAC signing key must be the same across all Workers instances. Using the existing `SIGNING_KEY` (Ed25519 PKCS8) as HMAC key material is convenient but conflates two security domains. A separate HMAC secret derived from SIGNING_KEY (e.g., `HMAC-SHA256(SIGNING_KEY, "artifact-token")`) provides domain separation.

### Risk 3: Token lifetime tuning
15-minute HMAC tokens assume the CLI downloads the WACZ promptly after hitting verify. For large WACZ files on slow connections, this might be tight. The CLI should start the download immediately after getting the URL, and the timeout should be generous enough for a 100MB file at modest speeds (100MB at 1 Mbps = ~14 minutes). 30 minutes may be safer.

### Risk 4: Old CLI versions will break silently
Users with cached npx versions or pinned dependencies will get 401s when the auth gate ships. The error path in `fetchBytes` (line 88-89 in key-resolver.js) currently throws `HTTP 401 fetching {url}` -- this is not actionable enough. The CLI should detect 401 specifically and suggest upgrading.

**Mitigation:** Even before the auth gate ships, a CLI patch release (0.1.1) could add the `waczUrl` detection logic so users who update get the new flow before it is required. This creates a grace period.

### Risk 5: Verify endpoint becomes a WACZ download vector
If the verify endpoint response always includes a tokenized WACZ URL, it effectively makes every capture downloadable by anyone who knows the capture ID. This is acceptable because: (a) capture IDs are 128-bit random (cap_ + 32 hex), making enumeration infeasible, and (b) the verify endpoint already performs full verification which requires fetching and processing the WACZ server-side, so the data is already being read. The tokenized URL just lets the client get a copy.

However, if the product requires that WACZ downloads be restricted even for verification purposes, the alternative is to have the verify endpoint return only the verification result (which it already does server-side) and NOT include a download URL. The CLI would then only do local verification when given a local file. This is the more restrictive option but degrades the DX for third-party verifiers.

**Recommendation:** Include `waczUrl` by default. If a tenant wants to restrict WACZ downloads, that could be a per-tenant config option (`allowPublicWaczDownload: false`) that omits `waczUrl` from the verify response.

## Additional Agents Needed

- **security-minion**: Must review the HMAC token scheme, the domain separation between HMAC artifact tokens and share tokens, the 401-vs-404 decision for cross-tenant access, and whether exposing `waczUrl` in the public verify response creates an unacceptable data exfiltration surface.
- **api-design-minion**: Should review the share token endpoint design (`POST /v1/captures/{id}/share`), the token query parameter convention, and the verify response schema additions to ensure consistency with existing API patterns.
- **test-minion**: Integration tests needed for: (a) CLI against auth-gated server, (b) HMAC token validation (valid, expired, wrong captureId, tampered), (c) share token CRUD and access grant, (d) backward compatibility -- old CLI against new server error path.
