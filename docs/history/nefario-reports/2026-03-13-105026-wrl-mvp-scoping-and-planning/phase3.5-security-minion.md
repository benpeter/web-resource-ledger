# Security Minion Review: WRL MVP Scoping and Planning

**Verdict: ADVISE**

The plan is well-structured and reflects the prior security discussions accurately. SSRF
prevention is sequenced correctly (Step 2, before capture), API key auth is present, and
the Ed25519 signing approach is sound. The issues below are gaps that will cause
insecure implementation if left to the implementer's discretion.

---

- [security]: The signing key storage requirement is not specified -- the plan says "key from env var" but gives no format, size, or generation guidance, leaving the implementer free to use a weak or improperly encoded key.
  SCOPE: Task 4, Issue 4 (WACZ Bundling and Signing) / Task 3 (Implementation Plan Step 4)
  CHANGE: Add a technical note specifying: Ed25519 private key must be stored as a base64-encoded 32-byte raw private key (not PKCS#8, not PEM) generated with `crypto.generateKey("Ed25519")` and exported via `exportKey("raw")`. Document that the public key is derived from the private key at startup, never stored separately. Warn against reusing keys across environments. The GitHub issue for Step 4 must include a checkbox: "[ ] Key generation documented -- never committed to VCS or stored in wrangler.toml."
  WHY: Underspecified key formats cause implementers to choose wrong encodings (PKCS#8 vs raw), paste keys into wrangler.toml (checked into VCS), or reuse dev keys in production. Ed25519 key mismanagement is a common failure mode that undermines the entire signing guarantee.
  TASK: Task 3 (Implementation Plan), Task 4 (GitHub Issues -- Issue 4)

- [security]: The SSRF prevention spec omits IPv6 private ranges and non-DNS URL formats that bypass the allowlist.
  SCOPE: Task 3 (Implementation Plan Step 2) / Task 4, Issue 2 (URL Validation and SSRF Prevention)
  CHANGE: Expand the blocklist to include IPv6 private ranges: `fc00::/7` (unique local), `fe80::/10` (link-local), `::1` (loopback -- already listed but confirm against IPv6-mapped form `::ffff:127.0.0.1`). Also add: reject URLs with embedded credentials (`http://user:pass@host`), reject `0.0.0.0` and `0.0.0.0/8`, reject DNS names that resolve to multiple addresses where any address is private (not just the first). The unit test checklist in Issue 2 must include these cases explicitly.
  WHY: The plan lists the core private ranges and some encoding tricks but misses IPv6 ULA/link-local ranges and credential-embedded URLs. A URL like `http://user@169.254.169.254/latest/meta-data/` or `http://[fc00::1]/internal` bypasses the current spec. SSRF via cloud metadata (169.254.169.254, 100.64.0.0/10 for Cloudflare Workers internal range) is the highest-impact attack on this system.
  TASK: Task 3 (Implementation Plan Step 2), Task 4 (GitHub Issues -- Issue 2)

- [security]: The redirect chain re-validation spec does not address DNS TOCTOU (time-of-check to time-of-use) between validation and browser fetch.
  SCOPE: Task 3 (Implementation Plan Step 2) / Task 4, Issue 2
  CHANGE: Add a note to Step 2 and Issue 2: after DNS pre-resolution and validation, the pre-resolved IP must be passed directly to Browser Rendering (Step 8 mentions "DNS pinning" but Step 2 and Issue 2 are silent on this). The implementation plan must make explicit that validation and browser fetch use the same resolved IP -- not two independent DNS lookups. Issue 2's acceptance criteria should include: "DNS resolution happens once; the resolved IP is passed to Browser Rendering, not re-resolved."
  WHY: DNS rebinding attacks work by resolving to a safe IP during validation and a private IP during the actual browser fetch. The plan mentions "DNS pinning" in Step 8 (Security Hardening) but it must be wired in at Step 2 (validation) where the IP is resolved. Separating the concern across two steps (2 and 8) risks the implementer building them independently and leaving the TOCTOU gap open.
  TASK: Task 3 (Implementation Plan Steps 2 and 8), Task 4 (GitHub Issues -- Issues 2 and 8)

- [security]: The capture ID generation spec ("cap_ prefix + random hex (crypto.randomUUID or crypto.getRandomValues)") conflates two APIs with different entropy guarantees.
  SCOPE: Task 4, Issue 3 (Capture Endpoint) -- Technical Notes section
  CHANGE: Remove the ambiguous "or" and pin the spec: use `crypto.randomUUID()` which produces 122 bits of cryptographically secure randomness and is available in Cloudflare Workers. `crypto.getRandomValues` requires buffer management and is lower-level. The issue should specify the final format: `cap_` + UUID with hyphens stripped (e.g., `cap_550e8400e29b41d4a716446655440000`). This removes implementer discretion on entropy source.
  WHY: If an implementer uses `Math.random()` or a timestamp-based ID (both have been seen when docs say "random hex" without specifying the API), capture IDs become guessable, enabling unauthorized access to any capture's metadata and artifacts via GET /captures/{id} -- which has no auth requirement.
  TASK: Task 4 (GitHub Issues -- Issue 3)

- [security]: The verification page spec ("Must work without JavaScript disabled") creates a server-side rendering path that is not described anywhere in the architecture.
  SCOPE: Task 3 (Implementation Plan Step 7) / Task 4, Issue 7 (Static Verification Page)
  CHANGE: Clarify the progressive enhancement requirement. If it means "show a meaningful noscript message," that is fine and requires no server changes. If it means "server-rendered verification result," that is a new architectural component requiring the Worker to render HTML responses from the verify endpoint. The Issue 7 spec must resolve this: either (a) add a `<noscript>` fallback that links directly to the verify API endpoint, or (b) explicitly move server-side HTML rendering to scope. Option (a) is consistent with YAGNI. Option (b) needs a new task.
  WHY: Ambiguous progressive enhancement requirements lead to ad-hoc server-side HTML rendering that bypasses the structured verify API, creates a second code path that may behave differently (different error handling, different caching), and could introduce XSS if capture metadata is reflected without encoding.
  TASK: Task 4 (GitHub Issues -- Issue 7)

- [security]: The static API key is specified as a single bearer token with no rotation or revocation mechanism, but the plan is silent on what happens when the key is compromised.
  SCOPE: Task 1 (MVP.md -- Security section) / Task 4, Issue 3 (Capture Endpoint)
  CHANGE: Add a one-line operational note to the MVP.md Security section and Issue 3: "Key rotation is a wrangler secret update + wrangler deploy (30-second operation). Document this in README." This is not scope expansion -- it is documenting the kill switch that justifies the auth model's existence. The issue should include a checkbox: "[ ] Key rotation procedure documented in README."
  WHY: The auth model was justified to reviewers as "a kill switch." If that kill switch has no documented operation procedure, it will not be used when needed. This is a gap between the stated security rationale and the actual operational reality.
  TASK: Task 1 (MVP.md), Task 4 (GitHub Issues -- Issue 3)

---

**No blocking concerns.** The plan sequence is correct (SSRF validation before capture endpoint,
auth before capture goes live, signing before storage). The Ed25519 approach is sound. The
`signatures` array extensibility is correctly designed. These advisories are hardening notes
for the GitHub issues and implementation plan documents -- they should be incorporated before
those documents are finalized, not after implementation begins.
