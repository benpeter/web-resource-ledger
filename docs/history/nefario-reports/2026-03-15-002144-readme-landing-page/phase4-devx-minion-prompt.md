You are rewriting the README.md for Web Resource Ledger (WRL) to serve as
an effective project landing page. The current README is a setup manual --
it shows infrastructure commands before explaining what the product does.
Your job is to restructure it so first-time visitors quickly understand
what WRL does, see it working, and then find setup instructions.

## Files to Read First

Read these files before writing anything:

- README.md (current content -- preserve all setup instructions)
- openapi.yaml (API spec -- derive curl examples from the examples section)
- CONTRIBUTING.md (local dev docs -- cross-reference, don't duplicate)
- package.json (version, engines, dependencies)
- docs/evolution/README.md (phase count for the despicable-agents section)

## Target Structure (in this exact order)

# Web Resource Ledger (WRL)

[badges on one line]
[one-line tagline -- keep existing]
[2-3 sentence positioning expansion]

## What you get
[concrete artifacts from a single capture -- bullet list]

## Usage
[env var setup note + 4-step numbered walkthrough]

## Setup
### Prerequisites
### 1. Install dependencies
### 2. Create KV namespace
### 3. Create R2 bucket
### 4. Configure capture API key     <-- NEW
### 5. Configure signing key          <-- existing content, renumbered
### 6. Deploy

## Development
[one-line cross-reference to CONTRIBUTING.md]

## Built with despicable-agents
[short section, links to docs/evolution/]

## Reference
### Key Rotation
### Public Key Endpoint

## License
[one line: Apache 2.0 with link]

## Section-by-Section Instructions

### Badges (one line, immediately below H1)
Four badges in this order: CI status, license, despicable-agents, vibe-coded.

### Tagline + Positioning
Keep existing tagline. Follow with 2-3 sentence positioning:
- Explain the "why" (prove what was online, and when)
- List concrete outputs
- Emphasize self-hosted, your-keys positioning
- NOT mention Cloudflare in positioning (save for Setup)
- NOT overclaim legal admissibility

### What You Get
Bullet list of concrete artifacts from a single capture.

### Usage Section
4-step numbered walkthrough using curl. Key decisions:
1. Use $WRL_API_KEY env var, show export once at top
2. Use wrl.example.com as placeholder (matches openapi.yaml), with note to replace
3. 4 steps: capture, poll, retrieve, verify. Use H4 for each step.
4. Show 202 response JSON for step 1 only. Steps 2-4 describe responses in prose.
5. Auth asymmetry callout at step 2: "No auth required -- the capture ID acts as the access secret."
6. Happy path only. Point to openapi.yaml for error codes.
7. Bridge note at top: "Requires a running WRL instance. See Setup below."
8. Total section length: under 50 lines.

### Setup Section
Preserve ALL existing setup content, reorganized:
- Prerequisites: change "Node.js 18+" to "Node.js 20+"
- Steps 1-3: existing KV/R2 instructions
- Step 4 (NEW): CAPTURE_API_KEY -- generate with `openssl rand -hex 32`, production wrangler secret put, local .dev.vars, bridge sentence "In the usage examples above, this is $WRL_API_KEY", security warning about not committing
- Step 5: existing signing key content, renumbered, include separate .dev.vars security warning
- Step 6: Deploy (wrangler deploy)

### Development Section
One-line cross-reference to CONTRIBUTING.md. Do NOT show npm run dev.

### Built with despicable-agents
Short section, link to docs/evolution/. Count phases from docs/evolution/README.md.

### Reference Section
Move Key Rotation and Public Key Endpoint here from current README.

### License
One line: Apache 2.0 with link.

## ADVISORY NOTES FROM REVIEWERS (incorporate these)

1. [security] Use exactly `openssl rand -hex 32` for CAPTURE_API_KEY generation. Do not substitute weaker alternatives.
2. [security] Make explicit that the verify URL is the safe public-sharing mechanism, while the raw capture ID grants full artifact access. Add a sentence in the Usage closing note.
3. [security] Repeat the `.dev.vars` security warning in both the CAPTURE_API_KEY section AND the SIGNING_KEY section independently.

## Constraints

- Single file change: Only modify README.md
- Preserve all existing setup content
- No .dev.vars.example file (out of scope)
- Total README length under 200 lines

## What NOT to Do

- No "How it works" or architecture section
- No error response examples
- No maturity/disclaimer note
- Don't change the tagline
- No "Features" list
- Don't mention Cloudflare in positioning
- No more than 4 badges
- No Contributing/Security/Code of Conduct sections

Write the complete rewritten README.md file.
