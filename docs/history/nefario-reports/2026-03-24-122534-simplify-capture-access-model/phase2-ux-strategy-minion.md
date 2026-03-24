# UX Strategy Analysis: Simplifying the Capture Access Model

## Executive Summary

The proposed change -- making individual capture access public (128-bit ID = capability token) while keeping list endpoint authed and removing share tokens entirely -- is a significant UX improvement. It reduces the number of mental models users must carry from three (tenant auth, share tokens, public verify) to two (tenant auth for list/create, public access by ID). More importantly, it aligns the access model with how users actually think about sharing evidence: "here's the link."

---

## (a) Third-Party Verifier Journey: Before and After

### Current Journey (broken)

The current state has a fundamental coherence problem. The verify page at `/v1/verify/{id}` is public by design, but the data it needs is gated:

1. Verifier receives a link (e.g., `/v1/verify/cap_abc123...`)
2. Page loads, spinner appears
3. Page JS fetches `/v1/verify/{id}` with `Accept: application/json` -- this works (public endpoint)
4. Verification result renders: pass/fail, cryptographic checks, metadata
5. **But**: screenshots, artifacts, and the "verify independently" CLI command all reference `/v1/captures/{id}` which returns 401

The verify page currently calls `populate(verifyData, null)` -- the second argument (`retrievalData`) is always null. This means:
- **No screenshot is displayed** (screenshot URL comes from `retrievalData.artifacts.screenshot`)
- **No before-screenshot is displayed** (same reason)
- The captured URL comes only from `verifyData.capture.url` (which the verify endpoint does include)
- The CLI command `npx @w-r-l/verify {origin}/v1/captures/{captureId}` tells users to download the WACZ from an authed endpoint -- this fails with 401

**User mindset**: "I received this link to verify a web capture. It says 'Verified' but I can't see the screenshot and the CLI verification command doesn't work. Is this actually trustworthy?"

This is a **catastrophic Nielsen heuristic violation**: the system promises public verifiability but does not deliver it. Visibility of system status fails (no error explains why screenshot is missing). User control fails (no way to fix the 401 without becoming a tenant). The error state is silent -- the page just omits data rather than explaining why.

### Proposed Journey (simplified)

1. Verifier receives a capture URL (e.g., `/v1/verify/cap_abc123...` or `/v1/captures/cap_abc123...`)
2. Page loads, fetches verification data -- works (public)
3. Verification result renders with all metadata
4. **Screenshot loads** -- because `/v1/captures/{id}/artifacts/screenshot` is now public
5. CLI command works -- `npx @w-r-l/verify` can download the WACZ without auth
6. "Verify independently" actually works end-to-end

**User mindset**: "I received a link, I can see the screenshot, the checks all pass, and I can independently verify if I want to. This is trustworthy."

**Journey improvement**: The emotional trajectory goes from confused-neutral (current: "it says verified but something feels incomplete") to confident-positive (proposed: complete, self-contained evidence presentation). This is the difference between a tool that *claims* public verifiability and one that *delivers* it.

### UX opportunity unlocked

With individual capture access public, the verify page can make a second fetch to `/v1/captures/{id}` to get artifact URLs. Currently, the `retrievalData` parameter in `buildResult()` and `populate()` is always null. After this change, the page JS can:

```
fetch(origin + '/v1/captures/' + captureId, { headers: { 'Accept': 'application/json' } })
```

This would populate screenshots, before-screenshots, and full artifact links -- transforming the verify page from a cryptographic-checks-only view into a complete evidence presentation page.

---

## (b) Tenant Impact: What Share Token Users Lose

### What share tokens provided

1. **Scoped access**: Token grants access to one specific capture only
2. **Time-limited access**: Tokens can expire
3. **Revocability**: Tenant can (theoretically, though no revocation API exists yet) revoke access
4. **Audit trail**: Token usage could be tracked

### What tenants lose

1. **Expiring access**: With public-by-ID, access cannot expire. If someone has the ID, they always have access.
2. **Revocability**: No way to "unshare" a specific capture (short of deleting it)
3. **Controlled sharing ceremony**: No explicit "create share link" action that signals intentional sharing

### Is the loss acceptable?

**Yes**, for three reasons grounded in how users actually behave:

**First**: The 128-bit capture IDs provide equivalent unguessability. A share token has 256 bits of entropy; a capture ID has 128 bits. Both are astronomically unguessable. The practical security difference is nil -- nobody is brute-forcing either. From a JTBD perspective, the job "share evidence with a specific party" is equally well served by sharing the capture URL directly.

**Second**: Share tokens were solving a problem that the current design already solved differently. The verify page was already public. The verify endpoint already confirmed capture existence. The only thing share tokens added was access to *artifacts* without tenant auth -- which this proposal gives to everyone by default. Share tokens were a workaround for an auth gate that shouldn't have existed.

**Third**: The Kano model categorizes share tokens as an "indifferent" feature for most users. The backlog shows three share-token-related items (revocation API, access analytics, auto-share config) -- all were marked "consider" tier and have now been removed. No user demand is evident. The cognitive cost of understanding "you need to create a share link before someone can verify your capture" is real and ongoing; the benefit is theoretical.

**One genuine loss**: tenants who wanted *time-limited* sharing (e.g., "this link expires in 24 hours") lose that capability. This is a niche use case. If it becomes important, it can be solved at the application layer (e.g., a URL shortener with expiry) rather than burdening the core access model.

---

## (c) Verify Page Implementation Simplification

### Current complexity

The verify page currently:
- Fetches only from `/v1/verify/{id}` (one API call)
- Has `retrievalData` plumbing in `buildResult()` and `populate()` that is *always null*
- Shows no screenshot (because screenshot URLs come from capture retrieval, not verify)
- The CLI "verify independently" command points to an endpoint that returns 401
- Screenshot rendering code exists but is dead code in practice

This is a confusing state for maintainers: the code *supports* rich display but the access model *prevents* it. Dead code paths that look intentional but never execute are a maintenance trap.

### After simplification

The verify page can:
1. Fetch `/v1/verify/{id}` for verification result (unchanged)
2. Fetch `/v1/captures/{id}` for full metadata + artifact URLs (newly possible)
3. Pass the capture data as `retrievalData` to `populate()` -- the existing code paths activate
4. Screenshots render. Before-screenshots render. All artifact links work. CLI command works.

**Implementation is simpler because the access model is simpler.** The page no longer needs to handle the case where some data is available and some isn't based on auth status. It's all-or-nothing: if the capture exists, everything is visible.

The Content Security Policy on the verify page already allows `img-src 'self'` and `connect-src 'self'`, so fetching artifacts from the same origin requires no CSP changes.

### One implementation note

The verify page should make both fetches in parallel (Promise.all) and render the verification result immediately even if the capture data fetch fails. The verification result is the critical path; screenshots are enhancement. This is progressive disclosure in action: show the essential (verification pass/fail) immediately, enhance with context (screenshots, artifacts) as data arrives.

---

## (d) Cognitive Load: "Knowing the ID = Having Access"

### The mental model is natural

This is how URLs have always worked on the web. Google Docs shareable links, Dropbox share links, GitHub Gist URLs, Pastebin URLs -- they all follow the "knowledge of URL = access" pattern. Users do not need to be taught this model because they already use it daily.

The current three-tier model (tenant auth / share token / verify-only) requires users to understand:
- "There are some endpoints I can access with my API key"
- "There are some endpoints I can access with a share token"
- "There is one endpoint (verify) I can access without auth"
- "Share tokens are different from API keys"
- "The verify page can show me some things but not others"

That is **five mental model elements** for a single concept (accessing a capture). Hick's Law and Miller's Law both predict this creates measurable cognitive friction.

The proposed model:
- "I can list my captures with my API key"
- "Anyone with the capture URL can access it"

That is **two mental model elements**. The reduction from five to two is significant.

### Risk: "But wait, is this actually secure?"

Some users (particularly enterprise/legal users) may have an intuitive concern: "If anyone with the URL can see my capture, isn't that insecure?" This is worth addressing proactively:

**In documentation and SECURITY.md**: Explain that capture IDs contain 128 bits of randomness, making them equivalent to a password in unguessability. Use an analogy users understand: "Capture URLs work like Google Docs 'anyone with the link' sharing. The URL itself is the access control."

**On the verify page itself**: No change needed. The verify page already communicates "this is a public verification page." Users arriving at the verify page expect public access.

**In API responses**: When a capture is created, the response includes the capture ID. This is the moment to reinforce the model: the documentation should note "anyone with this URL can access the capture and its artifacts."

### Risk: "What if I accidentally share the URL?"

This is a valid concern. But it's identical to the risk with share tokens -- accidentally sharing a share token URL exposes the same data. The difference is that share tokens *feel* more controlled because creating them was an explicit action. This is security theater -- the same data is exposed either way -- but the feeling matters.

Mitigation: the creation response should include the verify URL and a brief note that the URL is the access credential. This makes the user conscious of the URL's power at the moment of creation, not retroactively.

---

## Risks and Dependencies

### Risk 1: Rate limiting for public artifact access
With all artifact endpoints public, a motivated actor could download many captures' artifacts. The current WACZ endpoint already has IP-based rate limiting (`VERIFY_RATE_LIMITER`). This should extend to all public artifact endpoints (screenshots, HTML, headers). **Dependency**: rate limiter configuration must cover the expanded public surface.

### Risk 2: Content policy enforcement
Currently, quarantined captures return 451 on the verify endpoint. With individual capture access becoming public, the quarantine check must also apply to `GET /v1/captures/{id}` and artifact endpoints. **Dependency**: quarantine enforcement must be consistent across all public access paths.

### Risk 3: The verify page needs a second fetch
The verify page currently makes one fetch. After this change, it should make two (verify + capture metadata) to display screenshots. This is a functional improvement but adds a network dependency. **Requirement**: the page must gracefully handle the case where the verify fetch succeeds but the capture metadata fetch fails (e.g., show verification result without screenshot, not a broken page).

### Risk 4: D1 schema migration for share token removal
The `share_tokens` table and its cleanup cron must be removed. This is a database migration that should be staged: first deploy the code that stops creating/reading share tokens, then drop the table in a subsequent migration. **Dependency**: migration sequencing.

---

## Recommendation

**Proceed with the simplification.** The proposed access model is a strict UX improvement across every dimension that matters:

| Dimension | Current | Proposed |
|-----------|---------|----------|
| Third-party verifier journey | Broken (401 on artifacts) | Complete (all data accessible) |
| Mental models required | 5 | 2 |
| Verify page completeness | Verification only (no screenshots) | Full evidence presentation |
| Share workflow | Create token, send URL with token | Send capture URL |
| Maintainability | Dead code paths, three auth modes | One public access pattern |
| Kano classification | Share tokens = indifferent feature | Removal = no satisfaction loss |

The only material loss is time-limited sharing, which affects zero known users and can be solved at a different layer if demand emerges. The gain is a coherent, simple, trustworthy verification experience that delivers on the product's core promise: "anyone can verify."
