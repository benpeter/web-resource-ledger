Outcome: The signing key can be rotated without breaking verification of prior captures, removing a critical data integrity risk and the bold README warning about key rotation.

Success criteria:
- Every WACZ signature includes a keyId field (SHA-256 fingerprint, truncated to 8 hex chars)
- /.well-known/signing-keys endpoint serves historical public keys
- Verification endpoint reads keyId from WACZ and selects the correct historical key
- Key rotation procedure: generate new key, deploy, old key automatically archived in KV
- All existing captures remain verifiable after a key rotation
- Tests cover: signing with new key, verifying with old key, key archive retrieval

Scope:
- In: Updated signing flow, keyId in signedData, new well-known endpoint, KV storage for historical keys (signing-key:{keyId}), updated verification logic, tests
- Out: Automated key rotation scheduling, HSM integration, multi-tenant key management

Constraints:
- Must ship before any signing key rotation occurs -- rotating without versioning breaks all existing WACZ bundles
- Key count will be single digits over service lifetime; KV is appropriate storage

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees are running in parallel -- do NOT use evolution IDs that conflict. Use evolution directory 0017-key-versioning.
