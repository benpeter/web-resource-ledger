## Task: Update the @w-r-l/verify CLI to work with the capture auth gate

The capture retrieval endpoints now require authentication. The CLI's `fetchWaczFromCaptureUrl()` function fetches `/v1/captures/{id}/artifacts/wacz` without auth, which will now return 401. You need to update the CLI to support share tokens.

### Context

The CLI tool lives at `packages/verify/`. Key files:
- `packages/verify/lib/key-resolver.js`: Contains `fetchWaczFromCaptureUrl(captureUrl)` which constructs `{origin}/v1/captures/{captureId}/artifacts/wacz` and fetches it with no auth.
- `packages/verify/lib/key-resolver.js`: `isWrlCaptureUrl(input)` matches `/v1/(captures|verify)/cap_<id>`.
- `packages/verify/bin/wrl-verify.js`: CLI entry point.

**Server-side verification still works without changes**: `GET /v1/verify/{id}` remains public and unauthenticated.

**The problem is local/independent verification**: The CLI downloads the WACZ to verify it locally (trust-nothing model). This path now requires a share token.

### What to implement

#### 1. Accept share URLs with `?token=` in `fetchWaczFromCaptureUrl`

Update `fetchWaczFromCaptureUrl(captureUrl)` in `key-resolver.js` to:
1. Parse the input URL.
2. If it has a `?token=` query parameter, extract it.
3. When constructing the WACZ artifact URL, append the same `?token=` parameter.
4. This way, when a tenant shares `https://wrl.../v1/captures/cap_abc?token=wrl_share_...`, the CLI correctly passes the token to the artifact download.

Also update `isWrlCaptureUrl(input)` to handle URLs with query parameters.

#### 2. Improve error message for 401

In `fetchBytes()` or wherever the WACZ fetch happens, when the response is 401, provide an actionable error message explaining share tokens.

#### 3. Version bump

Bump `packages/verify/package.json` version from current to next minor (e.g., 0.1.0 -> 0.2.0).

#### 4. Update packages/verify/README.md

Add a section explaining the auth gate change:
- Share URLs work: `npx @w-r-l/verify "https://wrl.../v1/captures/cap_abc?token=wrl_share_..."`
- Verify URLs still work (no token needed): `npx @w-r-l/verify "https://wrl.../v1/verify/cap_abc"`
- Local file verification still works: `npx @w-r-l/verify ./bundle.wacz --origin https://wrl...`

### What NOT to do

- Do NOT add a `--token` CLI flag. Token propagation via the URL is sufficient.
- Do NOT add HMAC-signed waczUrl to the verify endpoint response.
- Do NOT add a `--api-key` flag.
- Do NOT modify any server-side code. This task is CLI-only.

### Tests

Update `packages/verify/test/` (if tests exist) or add tests:
- `isWrlCaptureUrl` accepts URLs with query parameters
- `fetchWaczFromCaptureUrl` propagates `?token=` to artifact URL
- `fetchWaczFromCaptureUrl` works without token (backward compat)

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
