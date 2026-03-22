# Phase 3.5: Margo Review

You are reviewing a delegation plan before execution begins. Your role: over-engineering, YAGNI, dependency bloat.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase3-synthesis.md

## Your Review Focus
- Is the plan over-engineered for a thin adapter layer?
- Are dependencies justified (MCP SDK, zod, @cfworker/json-schema)?
- Is 5 tasks too many for this scope?
- Does any task include unnecessary complexity (e.g., the verify_capture tool replicating signing key resolution logic vs calling existing functions)?

## Original User Request
Read the original user request from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/prompt.md

## Margo Scope Constraint
The complete feature set in this roadmap has been approved by the product owner. Your role is to ensure IMPLEMENTATION simplicity within each feature -- not to question whether features should exist. Focus on: unnecessary abstractions, over-engineered solutions, dependency bloat, premature optimization. Do NOT argue against features that are in the active roadmap or issue description.

## Instructions
Return exactly one verdict: APPROVE, ADVISE, or BLOCK. Be concise. Only flag issues within your domain expertise.
Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uxrItw/mcp-server-web-evidence/phase3.5-margo.md
