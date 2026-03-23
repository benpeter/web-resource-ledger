You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Capture retrieval endpoints require tenant authentication, enforcing that tenants can only access their own captures. Share tokens allow tenants to grant access to specific captures without exposing their API key.

## Your Planning Question

Design the API surface for:
(a) POST /v1/captures/{id}/share -- request body schema (expiresIn duration vs expiresAt timestamp? permanent flag?), response shape (token, shareUrl, expiresAt).
(b) How should the share token be passed on retrieval endpoints -- query parameter (e.g., ?token=xxx) as the issue specifies? What parameter name?
(c) Should the GET /v1/captures/{id} response include share-related metadata (like a list of active share URLs) or keep it lean?
(d) The auth-gated endpoints need to return 404 for cross-tenant access (not 403). How should this be documented in the API so clients can distinguish "capture does not exist" from "you don't have access" -- or is that ambiguity intentional?
(e) How should the status polling endpoint (GET /v1/captures/{id}/status) work with auth -- it's used during capture processing, so the tenant who created the capture needs access immediately.

## Context
Read these files for full context:
- src/index.js (current handler signatures: handleGetCapture, handleGetCaptureArtifact, handleCaptureStatus, route patterns)
- The existing route patterns and response shapes
- The issue scope constraints

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-api-design-minion.md
