# 0017 Decisions: Capture Parameterization Advisory

## Decision 1: General parameterization -- Hold

**Chosen**: Do not build general capture parameterization (viewport, cookies, wait conditions, session injection) in Act 1 or Act 2.

**Alternatives considered**:
- Build full parameterization now (api-design-minion, frontend-minion leaned this way with designs ready)
- Build only cookie handling now (ux-strategy-minion argued it's a "broken must-be")

**Rationale**: The competitive landscape splits cleanly. Screenshot APIs (URLBox, ScreenshotOne) compete on parameterization breadth; evidence services (Page Vault, Pagefreezer, FAW) limit caller control. WRL is positioned in the evidence category. Every caller-controlled parameter weakens the objectivity claim. Act 1 has 7 remaining items. No external user has reported any parameterization gap.

## Decision 2: Cookie consent -- server-controlled, not caller-controlled

**Chosen**: When built, consent dismissal will be a server-controlled operator policy, not a caller parameter.

**Alternatives considered**:
- Caller-controlled layered approach: Layer 0 (none), Layer 1 (CSS hide), Layer 2 (caller cookies) -- frontend-minion
- Caller parameter with provenance tracking -- api-design-minion

**Rationale**: Server-controlled preserves the attestation model. WRL says "we captured this URL and dismissed consent banners using method X." Caller-controlled opens the door to evidence that reflects the caller's choices rather than a neutral observation. gru's argument: evidence services that make legal admissibility claims deliberately limit caller control.

## Decision 3: Consent action (dismiss vs. reject-all) -- Deferred

**Chosen**: Defer to implementation time. Both approaches have merit.

**ux-strategy position**: "Dismiss without choosing" is maximally neutral -- removes the overlay without making a consent choice. Does not change what tracking/personalization the page performs.

**gru position**: "Reject all" minimizes tracking state. Keeps browser context closest to a neutral observer. Cleaner from a state perspective.

**Why deferred**: The choice depends on which action the selected consent library supports more reliably. Both must be recorded in metadata regardless.

## Decision 4: Cookie injection limit -- 20, not 50

**Chosen**: Max 20 cookies per request (security-minion recommendation).

**Alternative**: api-design-minion proposed maxItems: 50.

**Rationale**: The evidence use case for cookie injection is narrow (consent state, locale preferences). 20 is generous. Limiting reduces abuse surface. Can be raised if a legitimate use case emerges.

## Decision 5: Viewport cap -- 1920, not 3840

**Chosen**: Cap viewport width at 1920 initially (security-minion recommendation).

**Alternative**: api-design-minion proposed up to 3840 (4K support).

**Rationale**: The pixel budget constraint (50M pixels max) provides defense-in-depth. A 4K viewport with fullPage:true could exceed the pixel budget. Starting conservative is safer. Can be raised if demand materializes.

## Decision 6: Parameter metadata architecture

**Chosen**: `captureSettings` block in both `datapackage.json` (dense, all resolved settings) and KV (sparse, caller overrides). Automatically covered by existing Ed25519 signature chain.

**No alternatives seriously considered** -- all specialists agreed parameters must be in WACZ for portable evidence. data-minion's design was consensus.

## Decision 7: Parking lot tier -- [should], not [consider]

**Chosen**: Cookie consent dismissal enters parking lot at [should] tier.

**Alternative**: gru initially positioned it as [consider] (Assess ring).

**Rationale**: Compromise between YAGNI (don't build yet) and ux-strategy's "broken must-be" argument. The problem is real and well-understood, just not yet user-reported. [should] signals the team believes it's needed, even if timing isn't immediate.
