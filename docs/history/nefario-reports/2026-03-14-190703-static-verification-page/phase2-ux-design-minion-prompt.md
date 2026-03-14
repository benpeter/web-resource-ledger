You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Browser-accessible verification page for non-technical users. Single self-contained HTML page with inlined CSS and vanilla JS. Shows: URL, capture timestamp, SHA-256 bundle hash, verified/unverified badge, inline screenshot, three verification check results. Zero external HTTP requests (no CDN fonts, no analytics, no external scripts). `<noscript>` fallback shows capture ID and direct API link.

## Your Planning Question
Design the visual layout for a single-page verification result. It shows: URL, capture timestamp, SHA-256 bundle hash, verified/unverified badge, inline screenshot, three check results (artifactHashes, bundleHash, signature — each pass/fail/skip). Constraints: inlined CSS only, vanilla HTML/CSS, single HTML string from Worker, zero external HTTP requests. What does a trustworthy verification page look like? How should verified vs. unverified states differ visually? How should the three checks be presented? How should the screenshot be displayed (it needs to be fetched from the artifacts API as base64 or data URL)?

The verification API response shape looks like:
```json
{
  "id": "capture-id",
  "verified": true,
  "url": "https://example.com",
  "capturedAt": "2025-01-01T00:00:00.000Z",
  "signing": {
    "bundleHash": "sha256-hex-string",
    "publicKey": "base64-key",
    "algorithm": "Ed25519"
  },
  "checks": [
    { "name": "artifactHashes", "status": "pass" },
    { "name": "bundleHash", "status": "pass" },
    { "name": "signature", "status": "pass" }
  ],
  "artifacts": {
    "screenshot": { "contentType": "image/png" }
  }
}
```

## Context
Read these files for project context:
- `src/index.js` — existing Worker routing and response patterns
- `CLAUDE.md` — project philosophy (vanilla, KISS, no frameworks)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-design-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-ux-design-minion.md`
