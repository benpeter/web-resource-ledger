MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task
<github-issue>
Every WACZ bundle includes an RFC 3161 timestamp response from an independent TSA, transforming WRL's evidence claims from operator-asserted to third-party-verified. Verification confirms both signature integrity AND temporal proof.

**Success criteria**:
- Capture pipeline requests RFC 3161 timestamp from a reliable TSA (DigiCert or GlobalSign recommended)
- Timestamp response stored as new entry in signatures array (`type: "rfc3161"`) alongside existing `type: "self"`
- Verification endpoint validates both self-signature and TSA timestamp
- Verification page shows independent timestamp status
- ASN.1 parsing handles TSA response format correctly
- Graceful degradation if TSA is unreachable (capture succeeds, timestamp marked as absent)
- Tests cover: successful timestamp, TSA timeout, timestamp verification, malformed response

**Scope**:
- In: TSA integration module, ASN.1 parsing, updated WACZ bundling (signatures array extension), updated verification pipeline, TSA provider selection, tests
- Out: eIDAS Qualified TSA, multiple TSA redundancy, WACZ-Auth full spec compliance

**Constraints**:
- R2 (key versioning) should ship first -- signing pipeline will already be in motion
- The `signatures` array in `datapackage-digest.json` was designed for this extension; WACZ format does not need structural changes
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/r11-rfc3161-timestamps

## Codebase Context

This is a Cloudflare Worker (JavaScript, no TypeScript) that captures web pages, bundles them into WACZ archives, signs them with Ed25519, and provides verification. Key files:

- `src/signing.js` -- Ed25519 key management, sign/verify
- `src/wacz.js` -- WACZ assembly, currently creates datapackage-digest.json with flat signedData object
- `src/verify.js` -- WACZ verification (3 checks: artifactHashes, bundleHash, signature)
- `src/verify-page.js` -- HTML verification page (vanilla JS, no framework)
- `src/capture.js` -- Browser rendering pipeline, calls buildWacz()
- `src/index.js` -- Route handler, handleVerifyCapture builds verification response
- `src/kv.js` -- KV data model, completeCapture stores wacz info
- Test files in test/ directory (vitest)

Current datapackage-digest.json structure:
```json
{
  "path": "datapackage.json",
  "hash": "sha256:...",
  "signedData": {
    "hash": "sha256:...",
    "signature": "base64...",
    "publicKey": "base64...",
    "keyId": "hex8chars",
    "created": "ISO8601",
    "software": "WRL/0.1",
    "version": "0.1.0"
  }
}
```

The issue mentions a `signatures` array, but the current format has a flat `signedData`. This needs to be extended to support multiple signature types (self + rfc3161).

Runtime: Cloudflare Workers with nodejs_compat. Dependencies must work in this environment. No native Node.js modules (no child_process, no fs). crypto.subtle is available.

## External Skill Discovery
No external skills discovered in .claude/skills/ or .skills/ for this project.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning)
4. For each specialist, write a specific planning question that draws on their unique expertise
5. Return the meta-plan in the structured format
6. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-d9gkW5/rfc3161-timestamps/phase1-metaplan.md
