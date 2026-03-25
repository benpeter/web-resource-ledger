# Compliance Readiness (Phase 0069)

## Enterprise Adoption Gate

Compliance documentation is a procurement gate, not a feature. Enterprise buyers
with legal/procurement review processes cannot evaluate WRL without these
artifacts. Phase 0069 removes the gate.

## Personas Served

- **Enterprise procurement reviewer**: Scans the trust page (30s), reads the hub
  (5min), forwards the whitepaper + DPA to legal (30min). Three-tier progressive
  disclosure matches their evaluation workflow.
- **Legal/compliance officer**: Needs the DPA for Art. 28 compliance, subprocessor
  list for vendor risk assessment, privacy policy for Art. 13 disclosure review.
- **InfoSec reviewer**: Reads the whitepaper for architecture, encryption, key
  management. Checks incident response for operational maturity. The 18-control
  inventory table gives them a structured checklist.

## Pricing Implications

None. Compliance documentation is table stakes, not a premium feature.
All documents are publicly accessible — gating them behind a paywall would
undermine the trust signal they're designed to provide.

## Competitive Positioning

Most web archiving competitors either lack compliance documentation entirely
or gate it behind enterprise sales conversations. WRL publishes everything
openly:

- **Transparent DPA**: Available for download without contacting sales
- **Open subprocessor list**: With data categories, locations, and transfer
  mechanisms — not a vague "we use cloud providers"
- **Honest operational model**: Sole-proprietor limitations disclosed upfront
  rather than hidden behind enterprise theater

This positions WRL as "small but transparent" rather than competing on
SOC 2 / ISO 27001 certifications (which require audit engagements out of
scope for the current phase).

## UX Decisions

- **Trust page on landing site**: 30-second scan for enterprise buyers who
  land on webresourceledger.com. Compliance signals first (GDPR, DPA),
  then differentiators (Ed25519, RFC 3161).
- **Flat nav structure**: 6 security pages added as flat entries rather than
  nested groups. 15 total nav items is within acceptable density.
- **Outcome language in DPA**: Legal teams read TOMs, not engineers. "Credentials
  stored using one-way cryptographic hashing" instead of "SHA-256 with
  crypto.timingSafeEqual".
