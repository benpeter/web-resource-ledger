# Customer Personas

## Legal Evidence Collector (Phase 0063)

**Who**: Legal professionals, compliance officers, IP attorneys, or paralegals
who need web captures that hold up in EU courts.

**Need**: Captures with qualified timestamps that carry legal presumption of
accuracy under eIDAS Article 41(2). Standard RFC 3161 timestamps prove
existence-at-time, but only qualified timestamps have this explicit legal
standing across all EU member states.

**Behavior**: Enables eIDAS qualified timestamps at the account level. All
subsequent captures automatically include the qualified timestamp. Willing to
pay EUR 0.10/capture premium for legal certainty.

**Key concern**: Reliability. If the qualified TSA is down, they need to know
whether a specific capture has a qualified timestamp or not. The system
provides clear status: "Qualified (eIDAS)" vs "Standard (RFC 3161)" in both
the API response and the web UI.

**Discovery path**: Likely finds WRL through legal tech directories, eIDAS
compliance research, or referral from other legal professionals already
using web archiving for evidence.

## Compliance-Driven Organization

**Who**: Companies operating under EU regulatory frameworks that require
timestamped evidence of web content (GDPR data processing records, financial
compliance, advertising compliance).

**Need**: Account-level setting that ensures all captures are qualified
without per-capture configuration. Batch/scheduled captures all automatically
inherit the setting.

**Behavior**: Enables once, forgets about it. Expects the system to handle
TSA failures gracefully (standard-only fallback) and report status clearly.
Reviews capture detail views to verify qualified status when audited.
