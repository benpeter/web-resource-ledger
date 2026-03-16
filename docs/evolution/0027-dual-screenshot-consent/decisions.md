# Decisions: Phase 0025 -- Dual-Screenshot Cookie Consent

## D1: Artifact naming -- backward-compatible additive approach

**Decision**: Keep `artifacts.screenshot` as the primary field (always points to
the best available image -- post-dismissal when available). Add optional
`artifacts.screenshotBefore` for the pre-dismissal screenshot.

**Alternatives considered**:
- data-minion proposed `screenshotBefore`/`screenshotAfter` replacing `screenshot` entirely
- Array of screenshots

**Rationale**: api-design-minion's approach wins because existing consumers who
only care about "the screenshot" continue to work with zero changes. The
verification page and any future clients that want the banner screenshot can
check for the optional `screenshotBefore` field. This is the standard additive
API evolution pattern.

**Rejected**: Renaming `screenshot` to `screenshotAfter` would break all existing
consumers and require migration of existing KV records.

## D2: R2 storage keys

**Decision**: Primary screenshot keeps `captures/{id}/screenshot.png`. Before
screenshot uses `captures/{id}/screenshot-before.png`.

**Rationale**: The issue specified `screenshot-before.png` / `screenshot-after.png`,
but keeping `screenshot.png` as the primary avoids any migration of existing R2
objects. The before-screenshot is purely additive.

## D3: WARC URI scheme

**Decision**: New captures use `urn:wrl:screenshot:before:{url}` and
`urn:wrl:screenshot:after:{url}`. Old captures retain `urn:wrl:screenshot:{url}`.

**Rationale**: Clean break. WACZ bundles are immutable signed artifacts. Old
bundles are never modified. The verifier handles both URI patterns.

## D4: captureSettings schema -- minimal, no redundancy

**Decision**: `captureSettings` contains `version` (integer) and `consent`
sub-object only. No `screenshots` sub-object.

**Alternatives considered**: data-minion proposed `screenshots: { before: true, after: true }` booleans.

**Rationale**: margo review flagged this as redundant -- screenshot presence is
derivable from `consent.result` and `artifacts.screenshotBefore` existence.
Two sources of truth for the same fact is a maintenance hazard.

## D5: No separate WARC record for captureSettings

**Decision**: `captureSettings` lives in `datapackage.json` only, not as a
separate WARC metadata record.

**Alternatives considered**: data-minion proposed a WARC metadata record for captureSettings.

**Rationale**: margo review flagged duplication. The settings are operational
metadata about the capture, not a captured web resource. They belong in the
WACZ manifest, not in the WARC archive. The Ed25519 signature covers
`datapackage.json` (via canonicalize -> sha256 -> sign), so integrity is
preserved without a separate record.

## D6: Cosmetic rules disabled

**Decision**: `enableCosmeticRules: false` in autoconsent config.

**Rationale**: security-minion recommendation. Cosmetic rules hide banners with
CSS without actually dismissing consent. This creates a misleading "after"
screenshot -- the banner appears gone but consent was never given. For WRL's
evidence use case, this is worse than showing the banner.

## D7: NAV_TIMEOUT_MS reduction 25s -> 20s

**Decision**: Reduce navigation timeout from 25s to 20s to give the consent
phase its 8s budget within the 30s ctx.waitUntil limit.

**Trade-off**: Some slow-loading pages that previously succeeded will now trigger
partial capture. Typical consent phase is 1-3s, so the effective headroom is
usually 27-29s total. Sites needing 20-25s to reach networkidle are typically
heavy with tracking scripts -- exactly the sites with CMPs that benefit from
consent dismissal.

## D8: exposeBinding with polling fallback

**Decision**: Primary integration via `page.exposeBinding()`. If unavailable
in Cloudflare Browser Rendering, fall back to polling `window.__autoconsentResult`
via periodic `page.evaluate()`.

**Rationale**: frontend-minion recommended exposeBinding as the primary pattern
(matches DuckDuckGo's own test runner). security-minion and margo both flagged
the need for a fallback since Cloudflare's Playwright subset may not include it.
