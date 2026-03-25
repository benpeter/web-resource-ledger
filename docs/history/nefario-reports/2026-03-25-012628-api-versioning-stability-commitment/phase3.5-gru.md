## Gru Technology Review

**Verdict: APPROVE**

All technology choices are correct. Specific verifications:

**BUILD_VERSION (compile-time define)** -- correct approach. The pattern is already in production use for the health endpoint (`src/index.js:651`), injected via `--define BUILD_VERSION:"'${{ steps.meta.outputs.version }}'"` in both deploy workflows. The `typeof BUILD_VERSION !== 'undefined'` guard is the established pattern in this codebase and handles the test environment correctly. No issues.

**RFC 9745 vs RFC 8594 distinction** -- correctly handled. RFC 9745 (published March 2025, Standards Track) specifies the `Deprecation` header with Structured Field Date format (`@unix-timestamp`). RFC 8594 specifies the `Sunset` header with HTTP-date format. The plan correctly distinguishes these and uses the right format for each. The OpenAPI schema patterns (`'^@\d+$'` for Deprecation, plain string for Sunset) are accurate.

**Note on prior art**: The original issue spec (R34.md) and the evolution log prompt incorrectly attributed both headers to RFC 8594. The synthesis plan has corrected this. The correction is sound and should be preserved in the DEPRECATION-POLICY.md and CHANGELOG.md output.

**ROUTE_KEYS map approach** -- acceptable for the scale of this API. The regex-source-to-template mapping is deterministic and the DEPRECATIONS registry is empty at v1.0.0, so the runtime cost is zero until a deprecation is actually registered. The fragility risk (regex changes breaking ROUTE_KEYS lookup) is real but acceptable given the empty initial state and the fact that route changes are infrequent.

**src/version.js as importable constant** -- correct pattern for making the version testable without depending on BUILD_VERSION. The test strategy (assert semver format + assert against openapi.yaml) is sound.

No technology choices warrant a block or advisory change.
