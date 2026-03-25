# Domain Plan Contribution: software-docs-minion

## Recommendations

### Diagram Format: Mermaid, Not ASCII

**Use Mermaid exclusively.** Rationale:

1. **Docs site renders it natively.** The WRL docs site uses Eleventy with Markdown content (`site/content/*.md`). GitHub and most static site generators render Mermaid code blocks without plugins. No build step needed.
2. **Security whitepapers need labeled data flows, not spatial art.** The WRL architecture has 6 internal storage bindings, 6 external services, 3 queue pipelines, and multiple rate limiters. ASCII diagrams would be unreadable at this density. Mermaid sequence and flowchart diagrams handle labeled edges and grouping cleanly.
3. **Version control.** Mermaid lives in Markdown, diffs in PRs, and evolves with the codebase. Per CLAUDE.md: "For complex diagrams where spatial layout isn't critical, prefer Mermaid."
4. **Professional appearance.** Security whitepapers are trust documents. Mermaid renders cleaner than ASCII in both web and PDF contexts.

**Diagram types needed:**

| Diagram | Mermaid Type | Purpose |
|---------|-------------|---------|
| System Context (C4 L1) | `C4Context` | System boundary, users, external services |
| Data Flow - Capture Pipeline | `flowchart LR` | Client -> Worker -> Queue -> Browser Rendering -> R2/D1/KV + signatures |
| Data Flow - External Integrations | `flowchart LR` | Outbound calls: GitHub OAuth, Sectigo TSA, DigiCert TSA, Google Web Risk, Stripe, Coralogix, Resend |
| Personal Data Flow | `flowchart TD` | Where PII enters, how it is pseudonymized/discarded, where it is stored |
| Queue Architecture | `flowchart LR` | Three queue pipelines (captures, webhooks, emails) with DLQ fan-out |
| Authentication Flow | `sequenceDiagram` | OAuth PKCE flow, session lifecycle, API key auth |

### Architecture Section: Standalone Document, Referenced from Multiple Places

**Create a standalone `site/content/security.md`** (or `security/index.md` if subsections grow). Reference it from:

- The docs site nav (alongside Authentication, Verification, Legal Evidence)
- The README (link in "What's next" or "Trust" section)
- The legal-evidence page (which already discusses FRE 901/902 and eIDAS -- cross-link the technical underpinning)

**Do not embed architecture diagrams inline in multiple documents.** Single source of truth. Other pages link to specific sections via anchors (`/security/#data-flow-capture-pipeline`).

The security whitepaper page should have these sections:

```
# Security Architecture

## System Overview (C4 Context)
## Capture Data Flow
## External Service Integrations
## Personal Data Handling
## Authentication & Authorization
## Cryptographic Integrity (Ed25519 + RFC 3161)
## Infrastructure Security (Cloudflare isolation model)
## Rate Limiting & Abuse Prevention
## Logging & Observability
## Threat Model & Accepted Risks
```

### Personal Data vs. Operational Data: Separate Diagrams with Color Coding

The codebase has a clear separation that maps directly to diagram structure:

**Personal data (PII) flows:**
- IP addresses: enter via `CF-Connecting-IP`, immediately pseudonymized via HMAC-SHA256 with daily-rotated key (`computeCip`). Raw IP is NEVER stored or logged. Pseudonymized `cip` is logged to Coralogix for abuse correlation. GDPR Art. 4(5) pseudonymized data, 24-hour tracking window.
- GitHub user ID + username: stored in D1 `users` table via OAuth. GitHub access token is NEVER stored -- discarded after `/user` fetch.
- Email addresses: stored in D1 for notification preferences. Sent to Resend for transactional delivery.
- Session IDs: SHA-256 hashed before D1 storage. Raw session values never logged.

**Operational data flows (no PII):**
- Capture URLs, artifact hashes, timestamps, signatures: D1 metadata + R2 blobs
- WACZ bundles, screenshots, HTML, headers: R2 storage
- Queue messages: capture job payloads (captureId, tenantId, URL)
- Webhook delivery: captureId + tenant webhook URL
- Stripe: subscription/meter events (tenantId, no PII beyond what Stripe holds)
- Coralogix: structured logs with pseudonymized cip, never raw PII (see log.js NEVER LOG contract)
- TSA requests: hash of WACZ bundle sent to DigiCert/Sectigo -- no PII content

**Diagram approach:** Two separate flowcharts. The personal data diagram uses red/orange styling for PII entry points and green for pseudonymization/discard points. The operational data diagram uses standard blue/gray. Both diagrams label what crosses each boundary.

### C4 Level: Context (L1) + Custom Data Flow Diagrams (not L2/L3)

**C4 Context (L1):** One diagram showing WRL as a single system, the API consumer (tenant), the browser extension user, and all 6 external systems. This anchors the whitepaper.

**Do NOT use C4 Container (L2)** for the security whitepaper. Reason: WRL is a single Cloudflare Worker with bindings (D1, R2, KV, Browser Rendering, Queues). These are not separate "containers" in the C4 sense -- they are co-located bindings within one deployment unit. Forcing C4 Container notation would misrepresent the architecture. A data flow diagram showing the Worker's internal pipeline is more accurate and more useful for security analysis.

**Do NOT use C4 Component (L3).** The codebase is well-structured (capture.js, auth.js, oauth.js, billing.js, etc.) but the module structure is visible in the source. A security whitepaper needs to show data flows and trust boundaries, not module decomposition.

**Custom data flow diagrams** (Mermaid flowcharts with subgraphs for trust boundaries) are the right abstraction. They show:
- What data enters each boundary
- What transformation happens (hashing, signing, redaction)
- What leaves each boundary
- Where data is stored and for how long

---

## Proposed Tasks

### Task 1: C4 Context Diagram
**Deliverable:** Mermaid `C4Context` diagram in `site/content/security.md`
**Content:** WRL system box, API Consumer (tenant) person, Browser Extension User person, external systems: GitHub (OAuth), DigiCert TSA, Sectigo Qualified TSA, Google Web Risk, Stripe, Coralogix, Resend. Labeled relationships showing what data flows on each arrow.
**Estimate:** Small

### Task 2: Capture Pipeline Data Flow Diagram
**Deliverable:** Mermaid flowchart in `site/content/security.md`
**Content:** `POST /v1/captures` -> auth check -> URL validation -> threat check (Google Web Risk) -> Queue enqueue -> Queue consumer -> Browser Rendering (Playwright acquire/connect) -> screenshot + HTML + headers -> WACZ bundle -> Ed25519 sign -> RFC 3161 timestamp (DigiCert/Sectigo) -> R2 storage + D1 metadata + KV status. Show DLQ path. Label each arrow with the data that moves.
**Estimate:** Medium

### Task 3: External Integrations Diagram
**Deliverable:** Mermaid flowchart in `site/content/security.md`
**Content:** For each external service, show: what data WRL sends, what it receives, what credentials are used, and whether the call is synchronous or async. Services: GitHub OAuth (PKCE code exchange, user profile fetch), DigiCert TSA (RFC 3161 timestamp request with WACZ hash), Sectigo Qualified TSA (same + HTTP Basic auth for eIDAS), Google Web Risk (URL lookup via API key header), Stripe (subscription events, meter reporting, webhook verification), Coralogix (structured log entries, pseudonymized), Resend (transactional email delivery).
**Estimate:** Medium

### Task 4: Personal Data Flow Diagram
**Deliverable:** Mermaid flowchart in `site/content/security.md` with styled nodes
**Content:** Entry points for PII (IP address, GitHub profile, email address, session cookie), transformation points (HMAC pseudonymization for IP, SHA-256 hashing for session, token discard for GitHub), storage locations (D1 tables, Coralogix), retention/rotation (24-hour IP correlation window, session expiry). Explicitly label what is NOT stored (raw IP, GitHub access token, raw session ID, authorization codes).
**Estimate:** Medium

### Task 5: Authentication & Authorization Flow
**Deliverable:** Mermaid sequence diagram in `site/content/security.md`
**Content:** Two flows: (a) OAuth PKCE login -> GitHub redirect -> callback -> session creation -> first API key; (b) API key auth -> SHA-256 hash lookup -> scope check -> tenant context. Show rate limiters (AUTH_RATE_LIMITER, CAPTURE_RATE_LIMITER, CAPTURE_IP_GUARD, GLOBAL_CAPTURE_LIMITER). Show dual-auth path (session cookie vs API key).
**Estimate:** Medium

### Task 6: Security Whitepaper Prose Sections
**Deliverable:** Prose content for all sections listed in the architecture structure above
**Content:** Infrastructure security (Cloudflare Workers isolation, gVisor sandbox, BrowserContext isolation per capture.js comments), rate limiting (6 rate limiter bindings from wrangler.toml + application-level KV counters), cryptographic integrity (Ed25519 signing, RFC 3161 timestamping, WACZ bundle hash chain), threat model (accepted risks from capture.js: DNS rebinding, cross-origin iframe sub-nav), logging invariants (from log.js NEVER LOG contract).
**Estimate:** Large

### Task 7: Cross-linking from Existing Docs
**Deliverable:** Edits to `authentication.md`, `verification.md`, `legal-evidence.md`
**Content:** Add "See also: Security Architecture" links where relevant. Ensure no duplication -- existing pages describe usage, security page describes the trust model and data flows underneath.
**Estimate:** Small

---

## Risks and Concerns

1. **Diagram accuracy vs. code drift.** The diagrams encode architectural knowledge that can drift from the codebase. Mitigation: keep diagrams in the same repo, review them alongside code changes. Add a note in CLAUDE.md that PRs changing auth, capture pipeline, or external integrations must update `security.md`.

2. **Over-documentation of internals.** A security whitepaper that reveals too much internal structure (KV key formats, exact rate limit numbers, specific error handling paths) could aid attackers. Mitigation: document the security model (what guarantees exist) not the implementation details (how to bypass them). Show that IPs are pseudonymized, not the exact HMAC construction. Show that rate limiting exists at multiple layers, not the exact thresholds.

3. **Mermaid rendering limitations.** C4Context support in Mermaid is experimental. If rendering fails on the docs site, fall back to a standard `flowchart` diagram with subgraphs styled to look like C4 boxes. Test rendering before committing.

4. **Scope creep into compliance documentation.** The security whitepaper should describe the technical architecture, not make compliance claims (SOC 2, ISO 27001, GDPR compliance status). Those belong in separate compliance documents. The whitepaper provides the technical evidence that compliance documents reference.

5. **Single-page length.** Seven diagrams plus prose could make `security.md` very long. If it exceeds ~5 screen-lengths, split into `security/index.md` (overview + C4 context) with sub-pages (`security/data-flow.md`, `security/authentication.md`, `security/personal-data.md`). Decide after first draft based on actual length.

---

## Additional Agents Needed

- **security-minion** (if one exists): To review the threat model section and validate that the "accepted risks" from capture.js are appropriately characterized for an external audience. The capture.js comments are developer-facing; the whitepaper framing needs to be suitable for security reviewers and enterprise customers.
- **legal-compliance-minion** (if one exists): To ensure the personal data flow diagram and GDPR language (pseudonymization, Art. 4(5) references) are accurate and not making inadvertent legal commitments.
- Otherwise: **None.** The software-docs-minion can produce all diagrams and prose. Domain knowledge is fully derivable from the codebase -- the source files have excellent security documentation in their module headers (capture.js, oauth.js, log.js, ip-hash.js, threat-check.js).
