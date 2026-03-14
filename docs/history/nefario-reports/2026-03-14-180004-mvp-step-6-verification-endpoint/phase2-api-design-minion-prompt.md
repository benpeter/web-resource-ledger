You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Build a public verification endpoint (`GET /v1/verify/{id}`) for a web resource ledger. The endpoint proves a stored capture is authentic and unmodified by recomputing SHA-256 hashes, recomputing bundleHash from canonical JSON, and verifying the Ed25519 signature. No authentication required. Response cached with `Cache-Control: public, immutable, max-age=31536000`. Rate limited at ~60 req/min per IP. Must have passing end-to-end integration tests including tamper detection.

## Your Planning Question
Design the response shape and API contract for `GET /v1/verify/{id}`. Key questions:
1. Should the `capture` field mirror the existing retrieval response shape (from GET /v1/captures/{id}) or be a subset?
2. What granularity of failure detail should the `artifacts` field provide? Should individual artifact verification results be listed?
3. What HTTP status codes should be used? 200 for both verified:true and verified:false? Or different status for verification failure?
4. What should the error response look like for not-found captures, pending captures, captures without WACZ?
5. This API contract has downstream dependents (Step 7+) and is hard to change -- what should be designed for extensibility?

## Context
### Current retrieval response (GET /v1/captures/{id}):
```json
{
  "id": "cap_abc123...",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "...",
  "completedAt": "...",
  "artifacts": {
    "screenshot": "https://worker.test/v1/captures/cap_abc123/artifacts/screenshot",
    "html": "https://worker.test/v1/captures/cap_abc123/artifacts/html"
  },
  "wacz": {
    "url": "https://worker.test/v1/captures/cap_abc123/artifacts/wacz",
    "size": 42000,
    "bundleHash": "sha256:..."
  }
}
```

### WACZ datapackage-digest.json structure:
```json
{
  "path": "datapackage.json",
  "hash": "sha256:...",
  "signedData": {
    "hash": "sha256:...(bundleHash)",
    "signature": "base64...",
    "publicKey": "base64...",
    "created": "2024-...",
    "software": "WRL/0.1",
    "version": "0.1.0"
  }
}
```

### KV record shape includes:
- `artifacts`: { screenshot: R2key, html: R2key, headers?: R2key }
- `wacz`: { key: R2key, bundleHash: "sha256:...", size: number }

### Issue specifies response shape:
`{ "verified": true|false, "capture": { ... }, "artifacts": { ... } }`

## Instructions
1. Read relevant files to understand the current state (src/index.js for existing routes, src/responses.js for response patterns)
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-api-design-minion.md`
