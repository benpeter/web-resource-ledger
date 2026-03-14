You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Restructure README as project landing page with usage examples and complete setup docs. The README serves as an effective landing page so first-time visitors quickly understand what WRL does, see concrete usage examples, and find complete setup instructions — in that order.

## Your Planning Question
Review the proposed README structure as a first-time visitor journey. What cognitive load issues exist in the current README? Is there a risk that usage examples become too long before the reader reaches setup (which they need before examples work)? How should the document handle the tension between "show me what it does first" and "I need to set it up before I can try it"?

## Context
- Read the current README.md
- Target structure: positioning/why → usage examples → setup/deploy
- The API has an interesting auth asymmetry: POST /v1/captures requires Bearer auth (CAPTURE_API_KEY), but all GET endpoints are auth-free (capture ID IS the secret)
- Usage examples will include curl commands for: capture a URL, retrieve artifacts, validate a signed bundle

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase2-ux-strategy-minion.md
