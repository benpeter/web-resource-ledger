# Phase 0100: Decisions

## eIDAS Production Status

**Decision:** Apply "not yet live" language to eIDAS features.

**Evidence:** `wrangler secret list` shows no `QUALIFIED_TSA_AUTH` secret in
production. The eIDAS feature is code-complete but not deployed.

**Changes applied:**
- Landing page features section: "Code complete, production rollout pending"
- Docs comparison table: badge changed from `badge--pass "Optional"` to
  `badge--skip "Implemented (not yet live)"`
- Pricing left unchanged (Stripe product exists for when feature goes live)
- FAQ admissibility answer left unchanged (already says "consult legal counsel")

## Landing Page eIDAS Comparison Row

**Decision:** Skip the brief's instruction to change the landing page
comparison table's eIDAS row.

**Reason:** The landing page comparison table has only 4 rows (Crypto Signing,
Independent Timestamps, Public Verification, Open Format). There is no eIDAS
row in this table. The brief appears to reference a row that doesn't exist.
The eIDAS conditional change was applied to the features section instead,
which is where the eIDAS content actually lives on the landing page.

## No Editorial Changes

All copy was used verbatim from the implementation brief. No editorial
judgment was applied, per the brief's ground rules.
