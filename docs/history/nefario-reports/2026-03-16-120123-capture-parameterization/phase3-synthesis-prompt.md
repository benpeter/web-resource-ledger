MODE: SYNTHESIS
ADVISORY: true

You are synthesizing specialist planning contributions into a
team recommendation. This is an advisory-only orchestration --
no code will be written, no branches created, no PRs opened.

Do NOT produce task prompts, agent assignments, execution order,
approval gates, or delegation plan structure. Produce an advisory
report using the advisory output format.

## Original Task

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture. The biggest pain point is cookie consent banners dominating every screenshot. Broader question extends to viewport, wait conditions, session state injection, and how parameterization interacts with WRL's evidence mission.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-gru.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-data-minion.md

## Key consensus across specialists:

## Summary: ux-strategy-minion
Phase: planning
Recommendation: The clean-slate vs. parameterized tension is a false dichotomy. Evidence integrity comes from declaring conditions, not restricting them. Cookie consent handling should be a default behavior (dismiss, not accept), not an opt-in parameter. Distinguish "neutral" parameters (viewport) from "opinion" parameters (cookie consent) and surface the distinction to verifiers.
Tasks: 5 -- Define parameter taxonomy; Design capture provenance display; Validate cookie consent as default behavior; Define evidence claim language; Map parameterized capture user journey
Risks: Poor defaults hiding behind parameters; Evidence claim confusion; Contested neutral/opinion boundary; Scope creep toward generic screenshot API; Cookie consent long tail
Conflicts: Disagrees with gru on whether cookie consent should be a caller parameter vs. server-controlled default; recommends "dismiss without accepting" while frontend-minion and gru propose "reject all"
Full output: phase2-ux-strategy-minion.md

## Summary: security-minion
Phase: planning
Recommendation: Parameterization is safe IF every parameter category is independently threat-modeled and constrained. 12 minimum security constraints including: no caller-supplied JS execution, cookie domain scoping, viewport caps, pixel budget enforcement, wait strategy enum, parameterization flag in metadata. Two-tier evidence model recommended.
Tasks: 6 -- Define parameterization JSON Schema; Add parameters to KV/WACZ; Pixel budget enforcement; Cookie validation module; Security boundary tests; Multi-tenant risk reassessment
Risks: Cookie injection as credentialed proxy (CRITICAL in multi-tenant); Evidence fabrication; Playwright API drift; Timeout budget erosion
Conflicts: None -- largely aligned with other specialists on constraints
Full output: phase2-security-minion.md

## Summary: api-design-minion
Phase: planning
Recommendation: Extend existing POST /v1/captures with optional fields (not presets, not separate endpoint). Six initial parameters: viewport, waitUntil, maxWaitMs, cookies, screenshotMaxHeight. Add appliedParams to responses showing actual values used. Cookie values never echoed (count only). Backward compatible.
Tasks: 9 -- Define CaptureRequest schema; Define AppliedParams schema; Request body parsing; Extend performCapture(); Apply in renderer; Store in KV; Include in WACZ; Document ignoredFields; Validation tests
Risks: Cookie injection changes evidentiary meaning; Cookie domain validation security boundary; Clamping vs rejection; KV size growth (minor)
Conflicts: None significant
Full output: phase2-api-design-minion.md

## Summary: frontend-minion
Phase: planning
Recommendation: Do not build a general-purpose consent handler. Use layered, caller-controlled approach: Layer 0 (default, no handling), Layer 1 (CSS cosmetic hiding, ~60-70% coverage), Layer 2 (caller-provided cookies). Cookie pre-injection most reliable for known CMPs (85-90%). Defer autoconsent (Layer 3) to post-MVP.
Tasks: 5 -- API schema extension; Pipeline plumbing; CSS consent hiding module; Cookie pre-injection; Documentation
Risks: Selector drift; Custom banners uncoverable; GDPR implications; autoconsent bundle size
Conflicts: Recommends caller-controlled approach; gru argues server-controlled only
Full output: phase2-frontend-minion.md

## Summary: gru
Phase: planning
Recommendation: General parameterization: Hold. Server-controlled cookie consent dismissal: Assess. Market splits cleanly: screenshot APIs offer parameterization, evidence services limit it. WRL is in evidence category. Cookie consent should be server-controlled using autoconsent with "reject all" default. Timing: not now (Act 1 still in progress), add to Parking Lot.
Tasks: 3 backlog items -- Server-controlled cookie consent dismissal [should]; Viewport parameterization [consider]; Capture options metadata schema [consider]
Risks: Autoconsent fragility; reject-all vs accept-all policy; Scope creep; Bundle size; 30s budget; Evidence transparency
Conflicts: Strongest YAGNI voice; argues against caller-controlled parameterization
Full output: phase2-gru.md

## Summary: data-minion
Phase: planning
Recommendation: Parameters go in both datapackage.json (dense) AND KV (sparse). Ed25519 signature automatically covers parameters through existing chain -- no signing changes needed. Schema should be closed, minimal (4 fields Tier 1), with settingsVersion. KV impact negligible.
Tasks: 7 -- Define captureSettings schema; Extend buildWacz(); Extend KV; Thread through performCapture(); Update API responses; Extend verification; Migration note
Risks: Parameter injection into manifests; Schema evolution under immutable signatures; False precision; Defaulting implicit contract; KV growth
Conflicts: None
Full output: phase2-data-minion.md

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Identify consensus and dissent -- preserve minority positions
4. Produce an advisory report with executive summary, team consensus, dissenting views, supporting evidence, risks, next steps, and conflict resolutions
5. Write your complete advisory synthesis to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase3-synthesis.md
