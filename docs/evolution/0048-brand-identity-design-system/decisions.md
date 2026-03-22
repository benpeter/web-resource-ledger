# Decisions: Phase 0048 — Brand Identity and Design System

## Color Palette

**Decision**: Dark ink-blue primary (#2a3444) with warmed neutral grays, preserving existing semantic greens/reds.

- Over: Pure black (#1a1a1a) + neutral grays (existing) — reads as undesigned for a trust product
- Over: Corporate blue or startup teal — wrong tone for evidence/legal domain
- Rationale: Ink-blue communicates institutional trust (notarial seals, legal instruments) without being cold

**Decision**: Accent color (#3d7c9a) — desaturated teal-blue, distinct from primary.

- Over: Warm amber (would conflict with warning semantic color)
- Over: No accent (YAGNI) — issue explicitly requires "primary, secondary, accent"
- Rationale: Teal-blue provides visual contrast from the dark ink-blue primary while staying in the cool/professional family

**Decision**: Darken --color-text-muted from #7a7672 to #6e6a66.

- Over: Keep original (#7a7672) — fails WCAG AA on #f7f6f5 (page bg) and #f3f2f0 (surface-muted)
- Rationale: accessibility-minion review found contrast ratios of 4.17:1 and 4.03:1 on non-white backgrounds

**Decision**: Add --color-warning-text (#7a5800) separate from --color-warning (#e6a817).

- Over: Use #e6a817 for both icon and text — fails WCAG AA at 1.98:1 on warning-bg
- Rationale: Split intent: bright amber for icons/borders, dark amber for readable text

## CSS Integration

**Decision**: Keep CSS inlined in HTML via JS template literal export.

- Over: Serve as external file via Workers Static Assets — adds binding, routing, round-trip
- Over: KV/R2 storage — adds latency and operational complexity
- Rationale: Single CSS file under 10KB, zero-latency delivery, matches existing pattern

**Decision**: design-system.css as source of truth, design-system.js as manual sync.

- Over: Build script (even 5-line) — project says "no build step"
- Over: CSS directly in JS only — loses syntax highlighting and linting
- Rationale: Real .css file for editing, .js wrapper for deployment. Sync verified by test.

## Component Patterns

**Decision**: Include all 12 required component patterns, each under 10 lines.

- Over: Defer component patterns until R17 (ux-strategy-minion recommendation)
- Rationale: Issue success criteria explicitly require them. Keeping each under 10 lines respects YAGNI.

## Logo

**Decision**: Concept A (W-check) for favicon; both concepts retained.

- Over: Concept B (document-check) — 5 SVG elements, detail collapses at 16px
- Rationale: Single polyline mark survives 16x16 scaling. Concept B retained as alternative.

## Token Naming

**Decision**: No namespace prefix (--color-*, not --wrl-color-*).

- Over: Namespaced tokens (--wrl-*) — one consumer today, YAGNI
- Rationale: Reduces verbosity. Can add prefix later if WRL components embed in third-party contexts.
