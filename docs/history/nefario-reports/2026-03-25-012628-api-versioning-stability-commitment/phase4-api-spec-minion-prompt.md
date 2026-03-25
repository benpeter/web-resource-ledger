Task 1: OpenAPI spec -- header components, WRL-API-Version references, version bump

You are updating the WRL OpenAPI specification to declare the v1.0.0 API contract.

## Context

WRL is a Cloudflare Worker API for web resource archival. The spec is at openapi.yaml (currently 4665+ lines, OpenAPI 3.1.0). The project uses Redocly for linting (npm run lint:api).

The existing spec already defines header components in components/headers and references them via $ref in every response definition. You will follow this exact pattern.

## What to do

### Step 1: Add three new header components to components/headers

Add these entries following the existing PascalCase naming convention:

WRLAPIVersion:
  description: Semantic version of the WRL API that produced this response. Matches the info.version field.
  schema:
    type: string
    pattern: '^\d+\.\d+\.\d+$'
    example: '1.0.0'

Deprecation:
  description: Indicates the resource has been deprecated per RFC 9745. Value is a Structured Field Date (@timestamp). Absent on non-deprecated resources.
  schema:
    type: string
    pattern: '^@\d+$'
    example: '@1735689599'

Sunset:
  description: Date after which the resource may become unresponsive per RFC 8594. Value is an HTTP-date (RFC 7231). Present only alongside the Deprecation header.
  schema:
    type: string
    example: 'Sat, 31 Dec 2025 23:59:59 GMT'

IMPORTANT: Deprecation = RFC 9745 (Structured Field Date). Sunset = RFC 8594 (HTTP-date). Different RFCs, different formats.

### Step 2: Reference WRLAPIVersion from ALL response definitions

Add WRL-API-Version: $ref: '#/components/headers/WRLAPIVersion' to every headers: block in the spec that is a response-level headers block.

IMPORTANT COUNT CORRECTION: There are approximately 57 RESPONSE-level headers blocks. Not all headers: keywords in the file are response headers -- some are the components/headers definition block itself, schema properties named headers, or URL strings containing /artifacts/headers. Only add references to response-level headers blocks.

IMPORTANT: The spec DOES have an OPTIONS response defined (preflightCaptures for OPTIONS /v1/captures). This block also needs the WRLAPIVersion reference.

Do NOT add Deprecation or Sunset references to any response definition. Those headers appear only on actually-deprecated endpoints. Since no endpoints are deprecated at v1.0.0, these components are defined for future reference only.

### Step 3: Add x-deprecation-policy to info block

Add to the info section of openapi.yaml:

  x-deprecation-policy: https://github.com/benpeter/web-resource-ledger/blob/main/DEPRECATION-POLICY.md

This provides machine-readable discoverability from the API spec to the deprecation policy document.

### Step 4: Bump version and update examples

- Change info.version from 0.8.0 to 1.0.0
- Update the health endpoint's response example: change build.version example from '0.1.0' to '1.0.0'

### Step 5: Bump package.json version

- Change package.json version from 0.1.0 to 1.0.0
- These MUST be identical going forward (CI will enforce this)

### Step 6: Validate

Run npm run lint:api (Redocly lint) to verify the updated spec is structurally valid and all $ref paths resolve correctly.

After validation, count the number of WRLAPIVersion references in the file and compare against the number of response-level headers blocks. They should match.

## Files to modify
- openapi.yaml -- header components, response references, version bump, health example, x-deprecation-policy
- package.json -- version bump to 1.0.0

## What NOT to do
- Do NOT add Deprecation/Sunset header references to any response definition
- Do NOT restructure the spec into multiple files
- Do NOT add custom linting rules or Spectral configuration
- Do NOT modify any source code files (src/)

## Acceptance criteria
- info.version is 1.0.0
- package.json version is 1.0.0
- WRLAPIVersion, Deprecation, and Sunset header components exist in components/headers
- Every response-level headers block references WRLAPIVersion
- No response definition references Deprecation or Sunset
- Health endpoint example shows version 1.0.0
- x-deprecation-policy in info block points to DEPRECATION-POLICY.md
- npm run lint:api passes cleanly
