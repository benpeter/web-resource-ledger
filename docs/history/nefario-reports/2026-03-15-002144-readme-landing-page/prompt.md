Restructure README as project landing page with usage examples and complete setup docs

Outcome: The README serves as an effective landing page so that someone encountering the project for the first time can quickly understand what WRL does and why it matters, see how to use it with concrete examples, and then find complete setup instructions — in that order. The current README buries the value proposition and omits critical setup steps (CAPTURE_API_KEY), making first-time adoption unnecessarily difficult.

Success criteria:
- README structure follows: positioning/why → usage examples → setup/deploy (in that order)
- Positioning section explains what WRL does and why someone would want tamper-evident web archival (1-2 sentences beyond the tagline)
- Usage section includes curl-based examples for the core flow: capture a URL, retrieve artifacts, validate a signed bundle (derived from openapi.yaml)
- CAPTURE_API_KEY setup is documented for both production (wrangler secret put) and local dev (.dev.vars), at parity with existing SIGNING_KEY docs
- README mentions that the project is built using despicable-agents
- README includes the despicable badge (gold/amber shields.io badge linking to the despicable-agents repo) and the vibe-coded-badge-action badge
- All existing setup instructions (KV namespace, R2 bucket, SIGNING_KEY) are preserved — nothing removed, only restructured and augmented

Scope:
- In: README.md content, structure, and ordering
- Out: openapi.yaml changes, code changes, new documentation files, evolution log structure, CLAUDE.md changes

Constraints:
- Must reference openapi.yaml for API details rather than duplicating the full spec
- despicable-agents mention should be natural, not promotional — it's part of the project's story

---
Additional context: all approvals granted, dont stop for compactions. churn right through it while I sleep
