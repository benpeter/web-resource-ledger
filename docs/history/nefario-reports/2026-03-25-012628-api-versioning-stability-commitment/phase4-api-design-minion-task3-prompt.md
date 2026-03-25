Task 3: CHANGELOG.md and DEPRECATION-POLICY.md

You are authoring the CHANGELOG.md and DEPRECATION-POLICY.md for WRL's v1.0.0 release.

## Context

WRL is a web resource archival API reaching v1.0.0 -- the formal stability commitment. The API has been through versions 0.1.0 through 0.8.0 (tracked in openapi.yaml). The project has TERMS.md and CONTENT-POLICY.md at the repo root.

There is one existing changelog at packages/verify/CHANGELOG.md for the verify sub-package -- this is separate from the main API.

## What to do

### CHANGELOG.md

Create CHANGELOG.md at the repo root following Keep a Changelog 1.1.0 format.

File header:
# Changelog

All notable changes to the WRL API are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions before 1.0.0 were pre-release. Breaking changes were shipped as minor
versions per [SemVer convention](https://semver.org/spec/v2.0.0.html#spec-item-4).

Structure:
- ## [Unreleased] section at top (empty)
- ## [1.0.0] - 2026-03-25 section with this phase's changes
- Retroactive sections for 0.8.0 through 0.1.0
- Version comparison links at the bottom

1.0.0 section entries:
- Added: WRL-API-Version response header on all responses
- Added: Deprecation header mechanism (RFC 9745) and Sunset header (RFC 8594) support
- Added: DEPRECATION-POLICY.md with 6-month minimum notice commitment
- Added: CHANGELOG.md with retroactive history
- Added: CI enforcement of version sync between openapi.yaml and package.json
- Added: PR template with API changelog checklist
- Changed: Version synchronized across openapi.yaml (was 0.8.0), package.json (was 0.1.0), and git tags to 1.0.0

Retroactive history: Read the git log to reconstruct what changed in each version. Use git log --oneline and the evolution log docs. Version-to-feature mapping:

- 0.8.0: Simplified access model (removed share tokens), certificate endpoint, notification preferences, email notifications
- 0.7.0: Scheduled captures, content security scanning, capture auth gate, build metadata on health endpoint
- 0.6.0: Webhooks, tenant quotas, custom domain support
- 0.5.0: Per-tenant API keys, batch capture (207 Multi-Status), usage metering
- 0.4.0: RFC 3161 timestamp integration
- 0.3.0: Partial capture fallback, CORS preflight handling, HSTS, rate-limit headers
- 0.2.0: List captures endpoint, key versioning, staging environment, Terms of Service
- 0.1.0: Initial API -- capture, retrieval, verification, signing key, security headers, OpenAPI spec

Categorization rules (Keep a Changelog):
- Added: New endpoint, new field, new header, new auth method
- Changed: Modification to existing endpoint behavior
- Fixed: Bug correction
- Deprecated: Feature marked for future removal (none in history)
- Removed: Previously available feature no longer accessible
- Security: Changes addressing vulnerabilities

Only document API contract changes (what integrators see). Skip internal-only changes.

Include PR/issue references where available: (#123) format.

Get actual dates for historical versions from the git log -- find commits that bumped openapi.yaml version and use those dates.

Comparison links at bottom:
[Unreleased]: https://github.com/benpeter/web-resource-ledger/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.8.0...v1.0.0
etc.

Note: Pre-1.0 tags don't exist yet. The links will 404 for retroactive history -- acceptable for a pre-1.0 project.

### DEPRECATION-POLICY.md

Create DEPRECATION-POLICY.md at repo root with these sections:

1. Purpose -- WRL follows SemVer 2.0.0. This defines breaking changes, deprecation communication, and notice periods.

2. Versioning scheme:
   - Version communicated via WRL-API-Version response header
   - Major version changes require new URL prefix (/v2/)
   - Minor/patch are backward-compatible
   - Version in header matches info.version in openapi.yaml

3. What counts as a breaking change (requires major version or deprecation cycle):
   - Removing an endpoint
   - Removing a response field
   - Changing a field's type
   - Changing the meaning of a status code
   - Renaming a field
   - Making an optional parameter required

4. What is NOT a breaking change:
   - Adding a new endpoint
   - Adding a new optional parameter
   - Adding a new response field
   - Adding a new optional header
   - Fixing a bug where behavior didn't match spec
   - Performance improvements
   - New error codes for previously unvalidated inputs

5. Deprecation lifecycle:
   - Minimum 6 months from Deprecation header first appearing to Sunset date
   - All deprecated endpoints return Deprecation header (RFC 9745, @timestamp) and Sunset header (RFC 8594, HTTP-date)
   - Link header with rel="deprecation" points to migration guide
   - Headers appear on both success and error responses
   - CHANGELOG.md entry in Deprecated section
   - openapi.yaml marks endpoint with deprecated: true

6. Emergency deprecation:
   - Security vulnerability that cannot be patched without breaking backward compatibility
   - Minimum notice reduced to 30 days
   - CHANGELOG.md and migration guide published immediately

7. Communication channels: Response headers, CHANGELOG.md, migration guides, openapi.yaml

8. What this policy does NOT promise:
   - Individual notification to API key holders
   - Indefinite support for deprecated endpoints
   - That the 6-month period will never be shortened (reserved for security via emergency clause)

9. Standards note: "The Deprecation header follows RFC 9745. The Sunset header follows RFC 8594."

IMPORTANT: Reference BOTH RFCs explicitly. RFC 9745 (published January 2025) governs the Deprecation header. RFC 8594 governs the Sunset header. These are different standards with different date formats.

## Files to create
- CHANGELOG.md at repo root
- DEPRECATION-POLICY.md at repo root

## What NOT to do
- Do NOT modify packages/verify/CHANGELOG.md
- Do NOT modify any source code
- Do NOT create migration guides
- Do NOT promise email notifications

## Acceptance criteria
- CHANGELOG.md follows Keep a Changelog 1.1.0 format
- All versions 0.1.0 through 1.0.0 documented with categorized entries
- Entries reference PRs/issues where available
- DEPRECATION-POLICY.md covers all sections listed
- RFC 9745 cited for Deprecation, RFC 8594 for Sunset
- Emergency clause with 30-day minimum included
- Breaking vs. non-breaking definitions clear and complete
