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
- R2 (key versioning) should ship first — signing pipeline will already be in motion
- The `signatures` array in `datapackage-digest.json` was designed for this extension; WACZ format does not need structural changes

---
Additional context: R11 -- skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- pick the next available evolution sequence number (check docs/evolution/ for existing entries) and use the slug provided below. Evolution slug: rfc3161-timestamps.
