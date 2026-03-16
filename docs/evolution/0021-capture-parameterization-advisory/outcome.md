# 0017 Outcome: Capture Parameterization Advisory

## What was produced

Advisory report with team recommendation on capture request parameterization.
No code changes. Three new backlog items added to the Parking Lot.

## Key outputs

1. **Advisory report**: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization.md`
   with full specialist contributions in companion directory.

2. **Team recommendation**: Do not build general parameterization now. Address
   cookie consent through server-controlled dismissal when triggered by user
   demand or Web UI launch. Every future parameter must be WACZ-embedded and
   signature-covered.

3. **Security constraints**: 12 minimum security constraints defined for safe
   parameterization. No caller-supplied JS execution is a non-negotiable red
   line across all 6 specialists.

4. **Competitive landscape**: Clean market segmentation documented. Screenshot
   APIs compete on parameterization; evidence services limit caller control.
   WRL should stay in the evidence lane.

5. **Technical feasibility**: Four consent handling approaches evaluated with
   reliability estimates (CSS hiding 60-70%, click automation 70-80%, CMP APIs
   80-85%, cookie pre-injection 85-90%). Autoconsent library identified as the
   most viable path for broad coverage.

6. **Data architecture**: `captureSettings` schema designed. Ed25519 signature
   automatically covers parameters through existing canonicalize-hash-sign
   chain -- no signing code changes needed.

## Backlog changes

### Added to Parking Lot > Capture Fidelity
- [should] Server-controlled cookie consent dismissal (trigger: user report OR R17)
- [consider] Viewport parameterization (trigger: user reports viewport as problem)
- [consider] Capture options metadata schema (trigger: any parameterization ships)

### No items removed or changed tier

## Open questions for project owner

1. Consent action: "dismiss without choosing" vs. "reject all"
2. Default-on vs. opt-in for consent dismissal
3. Autoconsent bundle size evaluation needed before committing to that library
