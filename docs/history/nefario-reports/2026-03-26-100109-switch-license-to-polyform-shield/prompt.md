Switch license from Apache 2.0 to PolyForm Shield 1.0.0

**Outcome**: WRL is relicensed under PolyForm Shield 1.0.0, so the source remains fully public but competitors cannot use the code to offer a competing web capture service. No time-based conversion — the protection is permanent.

**Success criteria**:
- LICENSE file contains PolyForm Shield 1.0.0 text
- package.json license field updated to `PolyForm-Shield-1.0.0`
- README references the new license accurately
- CONTRIBUTING.md updated if it references the old license
- No other files still claim Apache 2.0
- Evolution log phase documents the switch with rationale

**Scope**:
- In: LICENSE file, package.json, README, CONTRIBUTING.md, any files referencing "Apache 2.0", evolution log entry
- Out: Adding per-file license headers, CLA setup, license scanning CI

**Constraints**:
- PolyForm Shield 1.0.0 (not FSL, not BSL, not CC)
