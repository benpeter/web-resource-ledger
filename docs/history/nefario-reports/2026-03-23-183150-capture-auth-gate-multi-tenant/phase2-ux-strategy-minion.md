# UX Strategy Contribution: Capture Auth Gate for Multi-Tenant

## Recommendations

### 1. The core mental model shift is harder than it looks

The current system has an elegant simplicity: capture a URL, get back an ID, use that ID to access everything. The capture ID *is* the access token. This is the kind of "don't make me think" design that users internalize instantly -- there's exactly one concept (the ID) and it does everything.

The proposed change introduces three distinct concepts where one existed:

- **Tenant authentication** (who you are)
- **Capture ownership** (which captures belong to you)
- **Share tokens** (granting access to others)

This is a necessary transition for multi-tenant security, but the cognitive load increase is real. The design must minimize the number of *new mental models* users need to adopt, not just the number of API parameters.

**Recommendation:** Frame the change around a single user-facing concept: "your captures are now private by default." Share tokens are the mechanism, not the concept. Don't surface token management as a separate feature -- embed it in the natural "I need someone else to see this" workflow.

### 2. Journey analysis: Three user personas, three different impacts

#### (a) Tenant retrieving their own captures

**Current journey:** Make API call with capture ID. Get data.
**New journey:** Make API call with capture ID + API key. Get data.

**Impact: LOW.** These users already authenticate for capture creation. Adding authentication to retrieval is consistent with their existing mental model. The API key is already in their headers for POST requests -- extending it to GET is a natural mapping (Nielsen: consistency). No new concepts needed.

**Risk:** The status polling endpoint (`GET /v1/captures/{id}/status`) is called repeatedly during capture processing. If this now requires auth, it's consistent but doubles down on the auth requirement. This is fine -- the user already authenticated to create the capture.

**One important friction point:** If a tenant uses the Web UI (session auth), the transition should be invisible. The session cookie already authenticates them. Verify that the existing `verifyAuth()` dual-auth pattern (session cookie first, API key fallback) is applied to all retrieval endpoints, not just creation endpoints.

#### (b) Tenant sharing a capture with a third party

**Current journey:** Copy the capture URL. Send it to someone. They open it. Done.
**New journey:** Call the share endpoint. Get a share token. Construct a URL with the token. Send the URL to someone. They open it. Done.

**Impact: HIGH. This is a three-step increase in interaction cost.** The current model is zero-friction sharing -- the URL *is* the share mechanism. The new model requires the tenant to explicitly create a share intent, which means:

1. The tenant must *decide* to share (a decision point that didn't exist)
2. The tenant must *generate* the token (an API call that didn't exist)
3. The tenant must *communicate* a URL that's longer and less clean

**Recommendation: Make share URL generation effortless.**

- The `POST /v1/captures/{id}/share` response should return the complete, ready-to-send URL (not just the token). The tenant copies one string and sends it. No URL construction required.
- The GET /v1/captures/{id} response should include a one-click share action in the response body -- e.g., a `shareUrl` field that contains the share endpoint, or ideally, the response itself could include a convenience share link if the tenant opts in.
- In the Web UI, add a "Share" button on the capture detail view that generates the token and copies the full URL to clipboard in one action.

**Recommendation: Auto-generate a share token on capture creation** (opt-in via capture settings or tenant config). For users whose entire workflow is "capture, then share with a client," having to make a second API call every time is pure friction. A tenant config flag like `autoShare: true` would eliminate this. The share token can be returned directly in the capture completion webhook payload and the GET /v1/captures/{id} response.

**Recommendation on token lifetime choices:** Offering "time-limited or permanent" is a Hick's Law trap unless handled well. Don't force the user to choose at creation time. Default to permanent tokens. Offer expiration only as an optional parameter. Most sharing use cases are "send this to my client/lawyer/counterparty once" -- they don't need expiration, and forcing them to think about it adds cognitive load for no benefit. The users who *do* need expiration (compliance, temporary access) will know to look for it.

#### (c) Third party verifying a shared capture

**Current journey (via browser):** Open the verify URL in a browser. See the verification page. Done.
**New journey:** Same. The verify endpoint remains unauthenticated.

**Current journey (via CLI):** Run `npx @w-r-l/verify <capture-url>`. CLI fetches WACZ, resolves key, verifies.
**New journey:** The CLI currently hits `/v1/captures/{id}/artifacts/wacz` to download the WACZ. This endpoint will now require auth. The CLI user doesn't have a tenant API key -- they're a third party.

**Impact: CRITICAL for the CLI verification tool.** This is the highest-risk journey.

The `wrl-verify` CLI tool calls `fetchWaczFromCaptureUrl()` which constructs the artifact URL `{origin}/v1/captures/{captureId}/artifacts/wacz` and fetches it without any authentication. Under the new model, this will return 401.

**The share token must work for artifact downloads, not just the capture metadata endpoint.** If a tenant generates a share URL like `https://api.webresourceledger.com/v1/captures/cap_abc123?token=shr_xxx`, the CLI tool needs to:
1. Accept this URL as input
2. Propagate the `?token=` query parameter to the artifact download URL
3. Or: the verify endpoint (which remains public) needs to continue working without changes

**Recommendation: The public verify endpoint is the escape valve.** Since `GET /v1/verify/{id}` remains unauthenticated and already performs server-side verification, the simplest path for third-party verification is unchanged: point people at the verify URL, not the capture URL. The verify endpoint already renders an HTML page for browsers and returns JSON for API consumers. The CLI tool should be able to verify using *just* the verify endpoint response (which includes all check results) without needing to download the WACZ.

However, this creates a tension: the CLI tool's *value proposition* is independent, client-side verification. "Trust the server's verification result" defeats the purpose. The CLI *must* be able to download the WACZ to verify locally.

**Recommended solution for CLI:**

1. Share tokens should work as query parameters on artifact URLs: `/v1/captures/{id}/artifacts/wacz?token=shr_xxx`
2. The CLI should detect and propagate `?token=` from the input URL to artifact download URLs
3. The `wrl-verify` README should document: "For remote verification of shared captures, use the share URL"
4. Example: `npx @w-r-l/verify "https://api.../v1/captures/cap_abc?token=shr_xxx"`

### 3. The "why can't I just send the URL anymore" problem

**This will happen.** Users who have been sharing capture URLs directly will try to do the same thing and hit a 401. This is a *reverse feature* in the Kano model -- something that worked before now doesn't.

**Mitigation strategies, in priority order:**

1. **Error message quality (Nielsen: help users recognize errors).** The 401 response for unauthenticated capture retrieval should explicitly say: *"This capture requires authentication. To share this capture with others, generate a share link: POST /v1/captures/{id}/share"*. Include the share endpoint URL in the error response body. Don't just say "Unauthorized."

2. **Backward compatibility period.** The prompt mentions "existing capture IDs remain accessible via share tokens for backward compatibility." Clarify the migration path: are *all* existing captures automatically given permanent share tokens? Or must tenants generate them retroactively? If retroactive, many existing shared URLs will break simultaneously. **Recommendation: Auto-generate share tokens for all existing captures as part of the migration.** This is a must-be feature for the transition. Return these tokens in the GET /v1/captures response so tenants can update their shared URLs.

3. **Gradual rollout.** Consider a soft launch: add auth support to retrieval endpoints but don't *require* it initially. Log unauthenticated accesses as warnings. After a notification period, enforce. This gives tenants time to update integrations.

### 4. Cognitive load analysis of the share token model

**Current model: 1 concept, 1 identifier**
- Capture ID = access

**Proposed model: 3 concepts, 2 identifiers**
- Tenant API key = "who I am"
- Capture ID = "which capture" (no longer sufficient for access)
- Share token = "grant access to someone else"

This is within the 7+-2 working memory constraint but right at the edge for new users learning the API. The critical design decision is whether share tokens are *visible infrastructure* or *embedded in URLs*.

**Recommendation: Share tokens should be URL-embedded, not a separate concept users manage.**

Bad (high cognitive load):
```
# Step 1: Generate a share token
curl -X POST /v1/captures/cap_abc/share -H "Authorization: Bearer wrl_live_..."
# Response: { "token": "shr_xxx", "expiresAt": null }

# Step 2: Tell the recipient to use it
"Hey, use this capture ID: cap_abc with this token: shr_xxx"

# Step 3: Recipient constructs the URL
curl /v1/captures/cap_abc -H "X-Share-Token: shr_xxx"
```

Good (low cognitive load):
```
# Step 1: Generate a share link
curl -X POST /v1/captures/cap_abc/share -H "Authorization: Bearer wrl_live_..."
# Response: { "shareUrl": "https://api.../v1/captures/cap_abc?token=shr_xxx", "verifyUrl": "https://api.../v1/verify/cap_abc" }

# Step 2: Send the URL
"Hey, verify this capture: https://api.../v1/verify/cap_abc"
# or for full access: "https://api.../v1/captures/cap_abc?token=shr_xxx"
```

In the good model, the recipient doesn't even know they're using a share token. They just received a URL that works. This is invisible computing -- the complexity is there but the user doesn't experience it.

### 5. The verify endpoint is the primary sharing mechanism

For third-party verification (the most common sharing use case), the verify URL (`/v1/verify/{id}`) is already the right answer. It remains public, it proves integrity, it renders nicely in browsers, and it works with the CLI.

**The share token model is for a different job:** giving someone access to the *raw artifacts* (screenshot, HTML, WACZ download). This distinction matters for framing:

- **"Check if this capture is authentic"** -> Use the verify URL (no token needed)
- **"Download this capture's artifacts"** -> Use the share URL (token embedded)

**Recommendation: Make the verify URL the default sharing recommendation.** In the Web UI, the primary "Share" action should produce the verify URL. A secondary action ("Share with full download access") generates the token-bearing share URL. Most users want verification, not artifact download. Progressive disclosure: show the simple option first, reveal the complex one on demand.

### 6. Status polling endpoint auth consistency

`GET /v1/captures/{id}/status` is used for polling during capture processing. Under the new model, it should require tenant auth (the user who created the capture is polling it). This is consistent and expected.

But there's a subtle UX issue: if a tenant shares a capture that's still processing, the share token recipient will see a capture URL that doesn't work yet. The status endpoint needs to honor share tokens too, so recipients can poll for completion. Otherwise they'll hit a wall: "I have a share link but the capture isn't ready yet, and I can't check when it will be."

**Recommendation: Share tokens should grant access to the status endpoint as well.** The complete list of endpoints that honor share tokens should be: status, metadata (GET /v1/captures/{id}), and all artifact downloads.

## Proposed Tasks

1. **Design share URL format and propagation** -- Decide on `?token=` query parameter vs. header. Query parameter strongly recommended (works in browsers, CLI, curl, and is self-contained). Define how the token propagates from capture metadata URL to artifact URLs.

2. **Update error responses for unauthenticated access** -- 401 responses on capture retrieval must include actionable guidance: how to authenticate, how to generate a share link. Not just "Unauthorized."

3. **Backward compatibility migration plan** -- Define whether existing captures get auto-generated share tokens. Strongly recommend yes. Plan the data migration (D1 records for share tokens on all existing complete captures).

4. **Update `wrl-verify` CLI for share token support** -- Modify `fetchWaczFromCaptureUrl()` in `key-resolver.js` to detect and propagate `?token=` from the input URL to artifact download URLs. Add documentation.

5. **Web UI share flow** -- Add "Share" button to capture detail view. Primary action: copy verify URL. Secondary action: generate share link with token, copy to clipboard. Single-click workflow.

6. **Design `autoShare` tenant configuration** -- Allow tenants to opt into automatic share token generation on capture completion. Include share URL in webhook payloads and capture response.

7. **Ensure dual-auth (session + API key) on all retrieval endpoints** -- Apply the existing `verifyAuth()` pattern to handleGetCapture, handleGetCaptureArtifact, handleCaptureStatus. Currently these handlers have no auth at all.

## Risks and Concerns

### HIGH: CLI verification tool breakage

The `wrl-verify` CLI currently fetches WACZ artifacts without authentication. If share token propagation in the CLI is not ready when the auth gate ships, remote verification via the CLI will break silently (401 on artifact download). The CLI and the API change must ship together, or the CLI must gracefully handle 401 with a clear error message explaining share tokens.

### HIGH: Existing shared URL breakage

Any capture URLs that tenants have shared externally (in emails, documents, reports, legal filings) will stop working when auth is enforced. This is a reverse feature -- previously working functionality stops working. Without a migration path (auto-generated share tokens for existing captures), this creates immediate, visible user pain.

### MEDIUM: Verify endpoint as enumeration vector

The verify endpoint remains unauthenticated by design. This means anyone who guesses a capture ID can confirm its existence and see verification results (verified/not-verified, timestamps, etc.). This is intentional (verification must be public for trust), but worth acknowledging that the auth gate on retrieval endpoints doesn't fully prevent enumeration -- it prevents *artifact access*, not *existence confirmation*.

### MEDIUM: Share token URL length and aesthetics

Share URLs will be significantly longer than current capture URLs (adding ~50 characters for the token). URLs shared in emails, chat, and documents may be truncated or look suspicious. Consider using compact token encoding (base62 vs. hex) and keeping the token as short as security allows.

### LOW: Complexity creep in token management

The scope excludes revocation and analytics, but users will immediately ask "how do I see who I've shared with" and "how do I revoke a share link." Plan the data model to support these future features (store creation timestamp, optional label, revoked_at field) even if the API doesn't expose them yet.

### LOW: Dual-path confusion

Having two valid ways to access a capture (API key + ownership vs. share token) creates a potential support burden. Users may not understand why one URL works and another doesn't, especially if they're mixing authenticated and unauthenticated access patterns. Clear error messages are the primary mitigation.

## Additional Agents Needed

- **api-design-minion**: Define the share token API surface (POST endpoint, response format, token format, query parameter naming). Ensure consistency with the existing API conventions (e.g., `wrl_live_` prefix patterns for tokens, RFC 7807 error responses).

- **security-minion**: Threat model for share tokens (brute force, token leakage, timing attacks on token validation). Define token entropy requirements, storage model, and the security implications of the verify endpoint remaining public post-auth-gate.

- **frontend-minion**: Implement the Web UI share flow (button, clipboard copy, feedback). Update the capture detail view to distinguish "your capture" (full access) from "shared capture" (limited access via token).

- **devx-minion**: Update the `wrl-verify` CLI tool for share token propagation. Update README and usage documentation. Ensure error messages guide users when authentication is missing.

- **test-minion**: Integration tests for the auth gate, share token generation and validation, cross-tenant isolation (tenant A cannot access tenant B's captures), token expiration, and backward compatibility (existing captures with auto-generated tokens).
