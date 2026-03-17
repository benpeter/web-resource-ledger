Implement two safety guards for DELETE /v1/admin/keys/{keyHash} in PR #90's admin.js:

1. **Self-revocation guard**: Before revoking, check if the keyHash being revoked matches the key used to authenticate this request. This requires threading the caller's keyHash through admin auth. Since PR #90 uses verifyAdminKey (env-var only), this guard only applies if we later add KV-based admin keys. For now, skip this guard -- ADMIN_KEY is an env-var and has no keyHash. Document the skip with a // TODO: self-revocation guard when KV admin keys are added.

2. **Last-admin-key guard**: Before revoking a key that has the 'admin' scope, check if there are other active (non-revoked) keys with 'admin' scope for the same tenant. If not, return 409 with detail "Cannot revoke the last admin key for this tenant". Use listApiKeyRecords from kv.js with tenant filter.

Add tests for both cases. Follow the existing test patterns in test/admin-keys.test.js. Keep changes minimal -- only modify src/admin.js and test/admin-keys.test.js.
