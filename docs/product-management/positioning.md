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
