MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
Restructure README as project landing page with usage examples and complete setup docs. The README serves as an effective landing page so first-time visitors quickly understand what WRL does, see concrete usage examples, and find complete setup instructions — in that order.

Success criteria:
- README structure follows: positioning/why → usage examples → setup/deploy (in that order)
- Positioning section explains what WRL does and why someone would want tamper-evident web archival (1-2 sentences beyond the tagline)
- Usage section includes curl-based examples for the core flow: capture a URL, retrieve artifacts, validate a signed bundle (derived from openapi.yaml)
- CAPTURE_API_KEY setup is documented for both production (wrangler secret put) and local dev (.dev.vars), at parity with existing SIGNING_KEY docs
- README mentions that the project is built using despicable-agents
- README includes the despicable badge and the vibe-coded-badge-action badge
- All existing setup instructions (KV namespace, R2 bucket, SIGNING_KEY) are preserved — nothing removed, only restructured and augmented

Scope:
- In: README.md content, structure, and ordering
- Out: openapi.yaml changes, code changes, new documentation files, evolution log structure, CLAUDE.md changes

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase2-product-marketing-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase2-ux-strategy-minion.md

## Key consensus across specialists:
- devx-minion: Single numbered walkthrough (4 steps), $WRL_API_KEY env var, explicitly highlight auth asymmetry, happy path only.
- product-marketing-minion: Three-sentence positioning, despicable-agents as short section near bottom with badge at top. Sections 1-4 fit one screenful.
- user-docs-minion: Replace API section with Usage. 3 badges on single line. Move Key Rotation/Public Key Endpoint to Reference section. Cross-reference CONTRIBUTING.md for local dev.
- ux-strategy-minion: Progressive disclosure with bridge paragraph. Usage under 50 lines. Auth asymmetry is a UX asset. Two-tier setup. Key rotation to Operations.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. This is a single-file README restructure. One task is likely sufficient, with one approval gate for the README draft.
7. The execution agent should read: current README.md, openapi.yaml, CONTRIBUTING.md, package.json, docs/evolution/README.md
8. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase3-synthesis.md
