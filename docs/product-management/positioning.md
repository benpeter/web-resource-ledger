# Competitive Positioning

## eIDAS Qualified Timestamps (Phase 0063)

**Differentiator**: WRL is one of very few web archiving services that offers
eIDAS-qualified RFC 3161 timestamps as an integrated feature. Most competitors
offer either no timestamps, proprietary timestamps, or standard (non-qualified)
RFC 3161 only.

**Competitive landscape**:
- **Wayback Machine / archive.org**: No cryptographic timestamps. No legal
  standing beyond "Internet Archive says so."
- **Conifer (Rhizome)**: WARC/WACZ archiving without cryptographic proofs.
- **Veripage / PageVault**: Proprietary evidence formats, not open standard.
  Some offer notarization but not eIDAS-qualified timestamps.
- **Pagefreezer**: Enterprise pricing, proprietary format, may offer timestamps
  but not as an open, verifiable standard.

**WRL advantage**: Open WACZ format + standard RFC 3161 + optional eIDAS
qualification. Captures are independently verifiable without vendor lock-in.
The qualified timestamp adds EU-wide legal standing at a transparent per-capture
price.

**Positioning statement**: WRL provides web evidence you can verify yourself,
with optional EU-qualified timestamps for legal certainty. No proprietary
formats, no vendor lock-in, no opaque pricing.

## API Stability Commitment (Phase 0065)

**Differentiator**: WRL v1.0.0 ships with a formal stability contract:
published CHANGELOG, 6-month deprecation policy (RFC 9745/8594 headers),
semantic versioning, and CI-enforced version sync. Most competing web
archiving tools offer no API stability guarantees at all.

**Competitive landscape**:
- **Wayback Machine**: No documented API versioning or deprecation policy.
  Endpoints change without notice.
- **Pagefreezer / PageVault**: Enterprise APIs behind sales walls. Stability
  contracts are per-contract, not publicly documented.
- **Conifer (Rhizome)**: Open source but no formal API versioning or
  deprecation commitments.

**WRL advantage**: Integrators (legal tech platforms, compliance tools, AI
agents via MCP) can build against WRL's API with confidence. The public
deprecation policy, machine-readable version header, and Keep a Changelog
format reduce integration risk to near-zero. This is a prerequisite for
enterprise adoption and third-party ecosystem development.

**Personas served**: API integrators, legal tech platforms building evidence
workflows, compliance automation vendors, AI agent developers using MCP.

## Simplified Sharing Model (Phase 0075)

**Differentiator**: WRL captures are shareable by default. No tokens, no
expiration, no access management. Share the URL, anyone can verify. This is
a deliberate product choice: capture IDs have 128 bits of entropy, making
them unguessable capability tokens. The security comes from the ID space,
not from auth layers on top.

**Competitive advantage**: Most evidence platforms require login or token
exchange to share captures. WRL's model means a lawyer can send a capture
URL in an email and the recipient can verify it immediately — no account,
no setup, no friction.

**Product story**: "Anyone can verify" is core to WRL's value proposition.
Phase 0062 accidentally broke this by adding auth to individual capture
endpoints. Phase 0075 fixed the regression by recognizing that the ID
itself is the access control.

## FRE 902(13) Certification Document (Phase 0073)

**Differentiator**: WRL generates a downloadable FRE 902(13) certification PDF
for every capture — a structured document describing the automated capture process,
integrity hashes, signature evidence, and operator identity. This directly supports
self-authentication under Federal Rules of Evidence 902(13), potentially eliminating
the need for live expert testimony to admit web capture evidence in US courts.

**Competitive landscape**:
- **Wayback Machine / archive.org**: Offers an affidavit service (manual, per-request,
  staff time required). No automated certification document.
- **Veripage / PageVault**: May provide evidence reports but in proprietary formats
  and often requiring manual steps or paid add-on.
- **Pagefreezer**: Enterprise evidence packages, but certification is typically part
  of expensive plans rather than available per-capture.

**WRL advantage**: Automated, deterministic, on-demand certification for every capture
at no additional cost. The document is itself signed (Ed25519 via response headers),
making it self-verifying. Combined with the open WACZ format and RFC 3161 timestamps,
WRL provides the complete evidentiary package a litigation team needs.

**Personas served**: Litigation paralegals preparing evidence packages, IP attorneys
handling trademark/copyright evidence, compliance teams documenting regulatory snapshots.

**Pricing implications**: Certificate generation is included in the base capture price —
no separate charge. This is a deliberate choice: the certificate adds legal value to
every capture and strengthens the core value proposition. Charging separately would
discourage usage and weaken the "evidence-grade by default" story.

## UX Decisions (Phase 0063)

- **Account-level, not per-capture**: Simplifies the mental model. Legal teams
  want "all my captures are qualified" not "I need to remember to check a box
  each time." Reduces cognitive load and eliminates the risk of forgetting.
- **Inline toggle with confirmation**: Enabling qualified timestamps triggers
  a confirmation dialog because it has billing implications. Disabling does
  not require confirmation (no cost impact).
- **402 with billing portal link**: If a tenant tries to enable eIDAS without
  a payment method, they get a clear path to fix it (link to Stripe billing
  portal), not a dead-end error.
- **Fallback transparency**: When the qualified TSA fails, the capture succeeds
  with standard-only. The UI shows "Standard (RFC 3161)" instead of "Qualified
  (eIDAS)" so the tenant knows exactly what they got.
