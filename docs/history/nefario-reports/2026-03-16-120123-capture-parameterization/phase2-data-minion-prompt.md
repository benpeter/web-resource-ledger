You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed
into a team recommendation, not an execution plan. Focus on analysis,
trade-offs, and recommendations rather than implementation tasks.

## Project Task

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture.

## Your Planning Question

If WRL supports parameterized captures, how should capture parameters be recorded for evidence provenance? Consider: (1) Should parameters be embedded in the WACZ bundle's `datapackage.json` manifest? (2) Should they be part of the KV capture record? (3) How does parameter recording interact with the Ed25519 signature -- should the signature cover the parameters to prove the capture was made with specific settings? (4) What's the schema for recording "this capture was made with viewport 1920x1080 and cookie consent auto-accepted"? (5) What's the KV storage impact if every capture record grows to include a parameter block?

## Context

Current KV capture record includes: captureId, url, ip, tenantId, status, createdAt, completedAt/failedAt, artifacts (R2 keys), wacz (key, bundleHash, size). WACZ `datapackage.json` includes per-artifact SHA-256 hashes, bundleHash, and Ed25519 signature. The signature covers the bundleHash which covers the manifest. KV has a 25 MiB value limit but current records are <1 KB.

Read the following files for additional context:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/wacz.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/kv.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/signing.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory/src/capture.js

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Return your contribution in the standard format.
4. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase2-data-minion.md
