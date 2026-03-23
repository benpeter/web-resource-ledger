You are reviewing a delegation plan before execution begins. Your role: identify gaps, risks, or concerns from your domain.

## Delegation Plan
Read the full plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase3-synthesis.md

## Your Review Focus
Security review of billing pipeline: idempotency key security (predictability/collision), Stripe API key handling in reporting path, financial data exposure on dashboard endpoint (billing amounts, tiers), tenant isolation in meter reporting (one tenant's events don't affect another), input validation on usage counters, protection against meter event injection.

## Original User Request
Read: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/prompt.md

## Instructions
Return exactly one verdict: APPROVE, ADVISE, or BLOCK. Be concise. Only flag issues within your domain expertise. Write your verdict to: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase3.5-security-minion.md