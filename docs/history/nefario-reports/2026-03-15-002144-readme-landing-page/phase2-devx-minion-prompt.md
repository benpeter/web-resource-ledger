You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Restructure README as project landing page with usage examples and complete setup docs. The README serves as an effective landing page so first-time visitors quickly understand what WRL does, see concrete usage examples, and find complete setup instructions — in that order.

## Your Planning Question
Given the WRL API flow (POST /v1/captures with Bearer auth -> poll status -> GET capture record -> GET artifacts -> GET /v1/verify), what is the most effective way to present curl-based usage examples in a README? Specifically: (a) Should the examples show the full async flow as a numbered walkthrough or separate code blocks? (b) How should CAPTURE_API_KEY appear in examples -- `$WRL_API_KEY` variable or literal placeholder? (c) The capture ID acts as the access secret for retrieval (no auth for GET endpoints) -- highlight this distinction or keep implicit? (d) Include error examples or stick to happy path?

## Context
- Read the current README.md, openapi.yaml, and CONTRIBUTING.md
- The capture endpoint requires Bearer auth (CAPTURE_API_KEY), but all GET endpoints (status, capture record, artifacts, verify) require no auth — the capture ID IS the access secret
- The issue specifically asks for curl-based examples derived from openapi.yaml

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase2-devx-minion.md
