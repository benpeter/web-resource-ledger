## Delegation Plan

**Team name**: simplify-capture-access
**Description**: Remove share token system, make individual capture endpoints public, auth-gate only the list endpoint. Issue #169.

### Task 1: Worker core -- remove share tokens, make capture GET endpoints public

- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are simplifying the WRL capture access model. The goal is: individual capture
    endpoints become public (no auth required), the list endpoint stays auth-gated,
    and the entire share token system is removed. This is issue #169.

    ## What to do

    ### 1. Remove share token auth path from `src/index.js`

    **Lines ~460-511** contain the `isCaptureGetRoute` auth block. Currently it has two
    branches: share token auth and standard tenant auth. Rewrite this block so that:

    - `GET /v1/captures` (the list endpoint, `pathname === '/v1/captures'`) still requires
      tenant auth via `verifyAuth()`. If auth fails, return the auth error response.
    - All other capture GET routes (`GET /v1/captures/{id}`, `/status`, `/artifacts/*`)
      skip auth entirely. Do NOT set `env._captureAuth` for these -- the handlers must
      work without it (see step 2).
    - Remove the entire share token branch (lines ~467-492).
    - Remove the WACZ special-case (`isWaczArtifactRequest`) since all artifacts are now public.

    **Lines ~28**: Remove the import of `generateShareToken, hashShareToken, createShareToken,
    getShareTokenByHash, deleteExpiredShareTokens` from `./share-tokens.js`.

    ### 2. Update capture GET handlers to work without `env._captureAuth`

    The handlers `handleGetCapture` (~line 1470+), `handleCaptureStatus` (~line 1830+),
    and `handleGetCaptureArtifact` currently require `env._captureAuth` and check
    `captureAuth.tenantId === record.tenantId` for tenant isolation. With public access,
    these handlers must work when `env._captureAuth` is NOT set.

    The pattern: if `env._captureAuth` exists, enforce tenant isolation (for authenticated
    requests -- they should still only see their own captures when using Bearer auth).
    If `env._captureAuth` is NOT set, skip tenant isolation and serve the capture to anyone.

    Remove all `captureAuth.scopedCaptureId` checks (that was share-token scoping).

    Remove all `captureAuth.authMethod === 'share_token'` token-forwarding logic
    (lines ~1497-1502 in handleGetCapture, lines ~1871-1877 in handleCaptureStatus).
    These append `?token=` to artifact/capture URLs -- no longer needed.

    ### 3. Remove `handleCreateShare` function and route

    - Delete the route entry at line ~69: `['POST', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/share$/, handleCreateShare]`
    - Delete the entire `handleCreateShare` function (~lines 1890-1974).

    ### 4. Remove share token cleanup from cron

    In the `scheduled()` handler (~lines 313-318), remove the
    `ctx.waitUntil(deleteExpiredShareTokens(...))` call and the associated error handler.

    ### 5. Delete `src/share-tokens.js` entirely

    The entire 110-line module is dead code after the above changes.

    ### 6. Add D1 migration to drop the share_tokens table

    Create `migrations/0013_drop_share_tokens.sql`:

    ```sql
    -- Drop the share_tokens table (share token system removed in #169)
    DROP INDEX IF EXISTS idx_share_tokens_expires_at;
    DROP INDEX IF EXISTS idx_share_tokens_tenant;
    DROP INDEX IF EXISTS idx_share_tokens_capture;
    DROP TABLE IF EXISTS share_tokens;
    ```

    ### 7. Cache-Control headers

    For the newly-public capture metadata and status endpoints, change
    `Cache-Control: private, no-store` to `Cache-Control: no-store` (drop `private`
    since responses are no longer per-tenant). Artifact endpoints already use appropriate
    caching headers -- leave those unchanged.

    ## What NOT to do

    - Do NOT add rate limiting to the newly-public endpoints (separate concern, tracked separately)
    - Do NOT add `X-Robots-Tag: noindex` headers (separate concern)
    - Do NOT audit error field exposure (separate concern)
    - Do NOT change the capture ID generation from UUID to getRandomValues (separate concern)
    - Do NOT modify the verify endpoint (`/v1/verify/`) -- it is already public and unchanged
    - Do NOT modify the verify page JS (`src/verify-page.js`) -- enhancing it with screenshot
      fetching is a separate task
    - Do NOT modify the `packages/verify/` CLI package -- that is a separate task
    - Do NOT change any auth logic for POST endpoints (capture creation stays authed)

    ## Key files

    - `src/index.js` -- main changes (auth block, handlers, route, cron, import)
    - `src/share-tokens.js` -- delete entirely
    - `migrations/0013_drop_share_tokens.sql` -- new file

    ## Verification

    After changes, confirm with a grep: `grep -r 'share.token\|shareToken\|share_token' src/`
    should return zero results.

- **Deliverables**: Modified `src/index.js`, deleted `src/share-tokens.js`, new `migrations/0013_drop_share_tokens.sql`
- **Success criteria**: No share token references in `src/`. Auth block only gates `GET /v1/captures` (list). Individual capture endpoints work without auth. D1 migration drops the table cleanly.

### Task 2: Tests -- update capture-retrieval tests, delete share-token tests, clean fixtures

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are updating the test suite after the share token system was removed and
    individual capture endpoints were made public. Task 1 already changed the worker
    code. Now the tests must match the new access model.

    ## What to do

    ### 1. Delete `test/share-token.test.js` entirely (373 lines)

    This file tests the share token system which no longer exists. No other test file
    imports from it. Safe to delete.

    ### 2. Update `test/capture-retrieval.test.js`

    **File header comment (lines 1-9):** Rewrite the security invariants to reflect
    the new model:
    - Individual capture endpoints are public (128-bit IDs as capability tokens)
    - WACZ artifacts remain publicly accessible
    - List endpoint requires authentication
    - Cross-tenant isolation applies only to the list endpoint

    **Imports (line 18):** Remove `seedShareToken` from the import.

    **Auth block (~lines 80-125):**
    - The test "unauthenticated request returns 401" (line ~81): Change expected status
      to 200. Rename to "unauthenticated request returns 200 (public access)".
    - Keep all authenticated access tests as-is (auth still works, just not required).

    **Tenant isolation block (~lines 131-183):**
    - DELETE "cross-tenant access returns 404" test (~line 132) -- with public access,
      any ID is accessible regardless of tenant.
    - DELETE "cross-tenant 404 is identical to non-existent capture 404" test (~line 142).
    - KEEP "response body does not include ip field" test but remove the auth header --
      IP must never leak regardless of auth status.
    - KEEP "security headers present on 200" test but remove auth header requirement.
    - UPDATE "Cache-Control: private, no-store on 200" to expect `Cache-Control: no-store`
      (without `private`).

    **Status endpoint block (~lines 189-210):**
    - Change "unauthenticated returns 401" to expect 200.
    - DELETE "cross-tenant access returns 404" for status.
    - Keep authenticated tests.

    **Artifacts block (~lines 216-311):**
    - Flip these from 401 to 200: unauthenticated screenshot, unauthenticated html,
      unauthenticated headers.
    - WACZ was already public -- no change.
    - DELETE all "cross-tenant screenshot/html/wacz access returns 404" tests (~lines 256-275).
    - DELETE "cross-tenant 404 is identical to non-existent capture 404 for artifacts" (~lines 295-311).
    - Keep unauthenticated 404 for non-existent/incomplete captures.

    **Share token propagation block (~lines 314-345):** DELETE the entire describe block.
    Both tests reference `seedShareToken` and test `?token=` query param propagation.

    **Add new tests:**
    - "unauthenticated request for nonexistent capture returns 404" (confirms no info leak)
    - "ip field absent from unauthenticated response" (critical security assertion)

    ### 3. Update `test/fixtures.js`

    - Remove the `seedShareToken` function (~lines 346-365).
    - Remove `DELETE FROM share_tokens` from the `cleanDb` function (~line 382).
      The D1 migration in Task 1 drops the table, so this DELETE would fail.
    - Remove the `hashShareToken` import from `../src/share-tokens.js` (~line 357).

    ### 4. Quick scan other test files

    Search for `share` or `401` in these files and fix any broken assumptions:
    - `test/auth.test.js` -- if it tests 401 on capture GET routes, update
    - `test/security-headers.test.js` -- if it sends unauthed requests to capture endpoints
    - `test/cors.test.js` -- if it assumes auth on capture endpoints

    ### 5. Run the test suite

    Run `npx vitest run` to confirm all tests pass. Fix any failures.

    ## What NOT to do

    - Do NOT modify `test/verify-integration.test.js` -- verify endpoint is unchanged
    - Do NOT modify `test/list-captures.test.js` -- list endpoint stays authed
    - Do NOT modify `test/e2e/` tests -- E2E tests are separate concern
    - Do NOT modify any source code in `src/` -- Task 1 handles that
    - Do NOT add tests for rate limiting or other deferred security features

    ## Key files

    - `test/share-token.test.js` -- delete entirely
    - `test/capture-retrieval.test.js` -- major updates
    - `test/fixtures.js` -- remove seedShareToken, update cleanDb

    ## Expected net test changes

    ~48 tests removed (38 from share-token.test.js, ~10 cross-tenant/share from
    capture-retrieval.test.js). ~8 tests modified (flip 401->200, remove auth headers).
    ~2 tests added. Net: ~46 fewer tests, all testing behavior that no longer exists.

- **Deliverables**: Deleted `test/share-token.test.js`, updated `test/capture-retrieval.test.js`, updated `test/fixtures.js`, passing test suite
- **Success criteria**: `npx vitest run` passes with zero failures. No references to share tokens in test files (except immutable historical files). Auth assertions match new model.

### Task 3: Verify package -- remove share token support from CLI

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are updating the `@w-r-l/verify` CLI package to remove share token support.
    The API no longer uses share tokens -- individual captures are publicly accessible.
    Work in `packages/verify/`.

    ## What to do

    ### 1. `lib/key-resolver.js`

    **Delete `shareTokenFromUrl` function** (~lines 39-52). It extracts `?token=wrl_share_*`
    from capture URLs. No longer needed.

    **Simplify `fetchWaczFromCaptureUrl`** (~lines 151-167):
    - Remove `const token = shareTokenFromUrl(captureUrl)` (~line 154)
    - Remove the `if (token) waczUrl += ...` conditional (~line 157)
    - The function becomes: extract captureId from URL, build artifact URL, fetch.

    **Rewrite 401 error message** (~lines 104-111):
    The current message says "This capture requires a share token." Replace with:

    ```javascript
    if (response.status === 401) {
      throw new Error(
        `HTTP 401 fetching ${url}\n\n` +
        `Individual captures are publicly accessible -- a 401 is unexpected.\n` +
        `Check that the URL points to a specific capture (e.g., /v1/captures/cap_<id>).\n\n` +
        `If you have a local .wacz file, verify it directly:\n` +
        `  npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com`
      );
    }
    ```

    ### 2. `test/key-resolver.test.js`

    - Remove `shareTokenFromUrl` from imports (~line 21).
    - Delete the entire `describe('shareTokenFromUrl', ...)` test block (~lines 92-110).
    - In the `fetchWaczFromCaptureUrl` tests (~lines 303-423):
      - DELETE the token-propagation test that verifies `?token=wrl_share_abc123` is
        appended to the WACZ download URL (~lines 315-356).
      - KEEP the test that verifies a plain capture URL builds the correct artifact URL
        (~lines 358-398). Rename the describe block from "token propagation" to
        "artifact URL construction".
      - UPDATE the 401 error message assertion (~lines 400-423) to match the new message.
        Change the assertion from `/share token/` to `/publicly accessible/` or similar.
    - For `isWrlCaptureUrl` test cases (~lines 57-65) that use `?token=wrl_share_abc`:
      update test data to use generic query params (e.g., `?foo=bar`) so the tests
      still verify query param tolerance without referencing share tokens.

    ### 3. `README.md` (in packages/verify/)

    Rewrite the "Remote capture with share token" section (~lines 22-31):

    ```markdown
    ### Remote capture

    ```bash
    npx @w-r-l/verify "https://api.webresourceledger.com/v1/captures/cap_abc123def456..."
    ```

    The signing key is fetched from the server automatically. Individual captures are
    publicly accessible -- no authentication or tokens are needed.
    ```

    Update the `/v1/verify/` section to clarify the distinction:
    - `/v1/captures/cap_<id>` = download WACZ and verify locally (what the CLI does)
    - `/v1/verify/cap_<id>` = server-side verification result (JSON or HTML)

    ### 4. Do NOT bump version

    The version bump (0.2.1 -> 0.3.0) should happen via the release workflow, not
    in this PR. Do not modify `package.json` version or `CHANGELOG.md`.

    ## What NOT to do

    - Do NOT modify any worker source code (`src/`)
    - Do NOT modify the `isWrlCaptureUrl` regex itself -- only update test data
    - Do NOT bump the package version
    - Do NOT remove the `/v1/verify/` URL support from the CLI

    ## Key files

    - `packages/verify/lib/key-resolver.js` -- remove shareTokenFromUrl, simplify fetch, rewrite 401 msg
    - `packages/verify/test/key-resolver.test.js` -- remove/update share token tests
    - `packages/verify/README.md` -- rewrite sharing section

    ## Verification

    Run `cd packages/verify && npm test` to confirm all tests pass.
    Run `grep -r 'share.token\|shareToken\|wrl_share' packages/verify/lib/ packages/verify/test/`
    to confirm no share token references remain.

- **Deliverables**: Updated `packages/verify/lib/key-resolver.js`, updated `packages/verify/test/key-resolver.test.js`, updated `packages/verify/README.md`
- **Success criteria**: `npm test` passes in verify package. No share token references in verify package code or tests. 401 error message reflects public access model.

### Task 4: Documentation -- update SECURITY.md, README, OpenAPI spec, site content

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are updating all documentation to reflect the simplified capture access model.
    Share tokens are removed. Individual capture endpoints are now public. The list
    endpoint stays auth-gated.

    ## What to do

    ### 1. `SECURITY.md` -- rewrite access model and threat analysis

    **Access Model section (lines 29-35):** Replace the three-path model with:

    - **Tenant authentication (Bearer token):** Required for `POST /v1/captures` (create),
      `GET /v1/captures` (list), and management endpoints. Tenants can only list their
      own captures.
    - **Public access (capture ID as capability):** `GET /v1/captures/{id}`, `/status`,
      `/artifacts/*`, and `GET /v1/verify/{id}` require no authentication. The 128-bit
      capture ID (`cap_` + 32 hex chars, 122 bits of entropy from UUID v4) functions
      as a capability token. Knowing the ID grants read access to the capture and all
      its artifacts. This is analogous to "anyone with the link" sharing in Google Docs.

    **Share Token Design section (lines 37-45):** Delete entirely.

    **Threat Analysis section (lines 46-55):** Rewrite:

    *Mitigated:*
    - Capture ID enumeration: 128-bit IDs make brute-force enumeration computationally
      infeasible. List endpoint requires tenant auth, preventing catalog-based discovery.
    - Cross-tenant list isolation: tenants can only list their own captures.
    - Credential exposure for sharing: capture URLs are shareable without API key exposure.

    *Residual risks:*
    - Capture ID as bearer capability: anyone who obtains a capture ID (from logs, shared
      URLs, browser history) can access that capture and all its artifacts. This is the
      intended design. Tenants should treat capture IDs with the same care as a document
      sharing link.
    - All individual capture endpoints confirm capture existence: intentional -- public
      verifiability is a core requirement.

    ### 2. `README.md` -- remove share token section, update curl examples

    **Lines 91-92** ("To share artifact access..."): Replace with:
    "Capture URLs are directly shareable -- anyone with the capture ID can access the
    capture and its artifacts. No tokens needed."

    **Lines 93-112** ("Sharing captures" section): Remove entirely. Replace with a brief
    paragraph:
    "> **Sharing:** Capture URLs are inherently shareable. Anyone with the URL can access
    the capture record and all artifacts. For proof-of-authenticity, share the `verifyUrl`
    which renders as a human-readable verification page."

    **Lines 67-73** ("Step 2: Poll for completion"): Remove the `-H "Authorization: Bearer
    $WRL_API_KEY"` header from the curl example. The status endpoint is now public.

    **Lines 76-80** ("Step 3: Retrieve artifacts"): Remove the auth header. Artifact
    endpoints are now public.

    **Lines 124-153** ("Finding and sharing captures"): Rename to "Finding captures" and
    remove the "sharing" framing. The list endpoint still requires auth -- keep that curl
    example with the auth header. Remove any mention of share tokens.

    ### 3. `openapi.yaml` -- remove share token scheme, endpoint, and token params

    This is a 4400-line file. Make these changes carefully:

    **a) Delete `shareToken` security scheme** from `components/securitySchemes` (~lines 51-58).

    **b) Delete the entire `/v1/captures/{captureId}/share` path** (~lines 2713-2796).

    **c) Update three GET capture endpoints** to `security: []`:
    For each of `getCaptureStatus`, `getCapture`, `getCaptureArtifact`:
    - Change `security` from `[bearerAuth, shareToken]` to `security: []`
    - Remove the `token` query parameter definition
    - Remove the `401` response reference ($ref to Problem401)
    - Remove the inline `410` response block ("Share token has expired")
    - Update the `description` to remove share token and auth references
    - Change `Cache-Control` from `private, no-store` to `no-store` (status and capture
      record endpoints only; artifact already has its own headers)

    **d) Update component-level descriptions:**
    - `CaptureId` schema (~line 122): Change to "Unique capture identifier (128-bit,
      unguessable). Knowing the capture ID grants read access."
    - `CaptureRecord` schema (~lines 511-520): Remove "Requires tenant authentication"
      and "To delegate read access, see POST /share". Add "Individual captures are
      publicly accessible by ID."

    **e) Bump version** from `0.7.0` to `0.8.0`.

    **f) After all edits**, search the entire spec for `shareToken`, `share`, `token`
    (in query param context), `410`, and `401` to catch any remaining references.

    ### 4. `site/content/authentication.md`

    **Endpoint table (~lines 36-54):**
    - Change `GET /v1/captures/{id}` scope from `read (or share token)` to `None (public)`
    - Change `GET /v1/captures/{id}/status` scope from `read (or share token)` to `None (public)`
    - Change `GET /v1/captures/{id}/artifacts/*` scope from `read (or share token)` to `None (public)`
    - Remove the `POST /v1/captures/{id}/share` row entirely

    **Note at line 56:** Rewrite: "The verification endpoint and individual capture
    endpoints are public by design -- anyone with the capture ID can access the capture
    and its artifacts. The list endpoint (`GET /v1/captures`) requires your API key."

    ### 5. `site/content/index.md`

    **Line 74:** Change from "use `POST /v1/captures/{id}/share` to generate a
    time-limited share link" to: "Capture URLs are directly shareable -- anyone
    with the capture ID can access the capture and its artifacts."

    ## What NOT to do

    - Do NOT modify `docs/evolution/0062-capture-auth-gate/outcome.md` -- it is immutable history
    - Do NOT create an ADR directory -- use the evolution log instead
    - Do NOT add rate limiting documentation (deferred)
    - Do NOT modify source code
    - Do NOT update `docs/backlog.md` -- it was already updated
    - Do NOT modify `site/content/verification.md` -- its share reference (~line 88) says
      "Share it freely -- no account is needed" which is still correct

    ## Key files

    - `SECURITY.md` -- rewrite access model and threat analysis
    - `README.md` -- remove share section, update curl examples
    - `openapi.yaml` -- remove share scheme/endpoint/params, update security, bump version
    - `site/content/authentication.md` -- update endpoint table and note
    - `site/content/index.md` -- update one note

    ## Verification

    After changes, confirm:
    - `grep -ri 'share.token\|wrl_share' SECURITY.md README.md openapi.yaml site/content/` returns zero results
    - The openapi.yaml is valid YAML (basic parse check)

- **Deliverables**: Updated `SECURITY.md`, `README.md`, `openapi.yaml`, `site/content/authentication.md`, `site/content/index.md`
- **Success criteria**: No share token references in any documentation file. OpenAPI spec valid. Access model documentation accurately reflects the new two-path model. Version bumped to 0.8.0.

### Cross-Cutting Coverage

- **Testing**: Task 2 handles all test updates. Phase 6 (post-execution) runs the full suite.
- **Security**: security-minion is the primary agent for Task 1 (the core access model change). The security assessment validated the 128-bit capability model as acceptable. Deferred items (rate limiting, X-Robots-Tag, error field audit) are tracked as separate concerns.
- **Usability -- Strategy**: ux-strategy-minion confirmed this is a strict UX improvement -- cognitive load drops from 5 mental model elements to 2. The verify page goes from broken to complete. No design task needed because no new UI is being created; the verify page's existing code paths will activate once the access model allows them.
- **Usability -- Design**: Not included. No new UI components or visual changes. The verify page already has screenshot rendering code that was dead due to auth gating -- it will activate automatically.
- **Documentation**: Task 4 covers SECURITY.md, README, OpenAPI spec, and documentation site. Phase 8 (post-execution) handles any residual documentation.
- **Observability**: Not included. No new runtime components. The removal of share token logging events is handled as part of the code deletion in Task 1.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This is a code removal / simplification task. No new UI, no new runtime components, no web-facing changes beyond removing auth gates, no user documentation that end users need to learn.
- **Not selected**:
  - ux-design-minion: No UI changes -- existing verify page code paths activate automatically
  - accessibility-minion: No HTML/UI changes produced by this plan
  - sitespeed-minion: No new web-facing runtime code; removing auth may marginally improve latency
  - observability-minion: No new services or components; share token log events are simply deleted
  - user-docs-minion: Documentation changes are API reference updates handled by software-docs-minion; no new user-facing tutorial or guide content needed

### Decisions

- **Worker handler pattern for public access**
  Chosen: If `env._captureAuth` is unset, serve capture publicly; if set, enforce tenant isolation
  Over: Always setting a "public" auth context object with null tenantId
  Why: Simpler -- no synthetic auth object needed. The handlers already need to check if `captureAuth` exists. The null-check pattern is clearer than a sentinel object.

- **D1 migration timing**
  Chosen: Deploy code + migration together in the same PR
  Over: Staged deployment (code first, migration later)
  Why: After the code change, the share_tokens table is completely unused. There is no grace period needed -- old `?token=` URLs will work because the endpoint is now public and the token param is ignored by the router. Deploying together is simpler and reduces operational steps.

- **Deferred security-minion recommendations**
  Chosen: Defer rate limiting, X-Robots-Tag, error field audit, and ID generation change
  Over: Including them in this PR
  Why: YAGNI / Helix Manifesto. This issue is about removing code and simplifying. Each deferred item is a separate concern with its own trade-offs. Bundling them would expand scope and obscure the simplification.

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Orphan share token references in code or docs | Low | Each task ends with a grep verification step |
| `cleanDb` in fixtures breaks if table dropped before test update | Medium | Task 2 is sequenced after Task 1; fixtures.js updated to remove the DELETE |
| Old CLI versions send `?token=` on capture URLs | Low | Server ignores unknown query params; endpoint is now public anyway |
| OpenAPI spec becomes invalid from missed reference cleanup | Medium | Task 4 includes post-edit grep for shareToken/410/401 remnants |
| Cache-Control change from `private, no-store` to `no-store` | Low | `no-store` is sufficient; CF Workers do not cache `no-store` responses |

### Execution Order

```
Batch 1 (sequential prerequisite):
  Task 1: Worker core changes

Batch 2 (parallel, after Task 1):
  Task 2: Test updates
  Task 3: Verify package updates
  Task 4: Documentation updates
```

Zero approval gates. All tasks are mechanical code/doc removal validated by the security assessment.

### Verification Steps

After all tasks complete:
1. `grep -r 'share.token\|shareToken\|share_token\|wrl_share' src/ test/ packages/verify/ SECURITY.md README.md openapi.yaml site/content/` -- should return zero results
2. `npx vitest run` -- all worker tests pass
3. `cd packages/verify && npm test` -- all verify package tests pass
4. Manual spot-check: the openapi.yaml parses as valid YAML and has no dangling $refs
