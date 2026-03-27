---
layout: layouts/doc.njk
title: How WRL Was Built
description: WRL was built almost entirely by an LLM. 60+ development phases documented with prompts, agent debates, decisions, and outcomes.
---

# How WRL Was Built

WRL is a production web evidence service. It is also a documented experiment
in LLM-driven software development.

## The Setup

A human (Ben) defined the product, made business decisions, and steered
direction. An LLM (Claude) wrote virtually all the code, tests,
infrastructure configuration, and documentation. The orchestration used
[despicable-agents](https://github.com/benpeter/despicable-agents), a
multi-agent framework where specialist agents (security, infrastructure,
API design, frontend, etc.) debate approaches before implementation.

## The Build

WRL went from first commit to production service in 10 days (March 13-22,
2026), across 60+ documented development phases:

- **Act 1 (Solid Foundation):** Core capture pipeline, authentication,
  per-tenant keys, CORS, rate limiting, security hardening.
- **Act 2 (Evidence-Grade):** RFC 3161 timestamps from DigiCert TSA, audit
  logging, production CD pipeline. Upgraded from "tamper-evident" to
  "independently verifiable."
- **Act 3 (Infrastructure):** MCP server, web UI, batch captures, scheduled
  captures, docs site, landing page, usage metering via Stripe, webhooks.

## The Documentation

Every phase is documented in the evolution log: the prompts given, the agent
debates, the decisions made, and the outcomes produced. When agents disagreed,
both positions are recorded along with the resolution. When the human
overrode an agent recommendation, the rationale is documented.

Browse the evolution log: [`docs/evolution/`](https://github.com/benpeter/web-resource-ledger/tree/main/docs/evolution)

## Why Document This?

Most AI-assisted development happens behind closed doors. WRL's evolution
log is an attempt to show what LLM-driven development actually looks like
at production scale -- the parts that work, the parts that don't, and the
human judgment calls that bridge the gap.

The product stands on its own merits regardless of how it was built. But if
you're evaluating what LLMs can and can't do for software development, the
evolution log is a primary source.
