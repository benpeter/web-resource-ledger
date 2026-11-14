---
layout: layouts/doc.njk
title: Architecture
description: How WRL captures web pages, builds cryptographic proof bundles, and enables independent verification.
---

# Architecture

This page explains how WRL works under the hood -- the flows a tenant API consumer sees, and the internal pipeline that produces tamper-evident captures. It is aimed at technical evaluators who want to understand the system before integrating or before presenting captures as evidence.

## User Interaction Flows

The sequence diagram below shows the four interaction patterns available to API consumers: authenticating (GitHub, an emailed sign-in link, or an API key), submitting captures (single or batch), polling for results, and verifying a completed capture.

[![Sequence diagram: a tenant signs in with GitHub, an emailed link or an API key, submits a single or batch capture, polls its status and fetches the record, and a verifier checks the capture with GET /v1/verify/{id} and can download the certificate PDF](/assets/diagrams/architecture-flows.svg)](/assets/diagrams/architecture-flows.svg)

The verify endpoint is intentionally unauthenticated -- any third party can verify a capture without an account. The verification decision is driven by five independent checks run against the WACZ bundle itself (see [Verification](/verification/) for details). Signing key resolution uses the server's authoritative key store via `/.well-known/signing-key(s)`, not the key embedded in the bundle.

## Capture Pipeline & Integrity Chain

The flowchart below traces a single capture from HTTP ingestion through browser rendering to the final signed WACZ bundle in storage.

[![Flowchart of the capture pipeline: authentication, rate limit, quota, URL validation and threat screening; browser rendering with screenshots before and after cookie consent; WACZ assembly with per-file hashes, bundleHash, Ed25519 signature and timestamps; storage and webhook dispatch; and the five verification checks](/assets/diagrams/architecture-pipeline.svg)](/assets/diagrams/architecture-pipeline.svg)

The diagram highlights two design decisions that matter for trust.

**The integrity chain.** Every artifact file is hashed individually. Those hashes go into `datapackage.json`. The canonical JSON of that manifest is hashed to produce `bundleHash`. Then `bundleHash` is signed and timestamped. All three attestations (Ed25519 signature, RFC 3161 timestamp, and optional eIDAS qualified timestamp) cover the same `bundleHash` -- they are siblings in the `signatures` array, not a sequential chain. Any modification to any artifact at any level breaks the `bundleHash` and invalidates all attestations at once.

**Key resolution.** Verification uses the server's current public key (fetched from `/.well-known/signing-key`) to verify the signature. The public key embedded in the WACZ bundle is informational only and is never trusted for the verification decision. Historical keys remain available at `/.well-known/signing-keys` so that captures signed under a rotated key continue to verify indefinitely.

<details>
<summary>eIDAS qualified timestamps</summary>

RFC 3161 timestamps are included in every capture by default. The eIDAS qualified timestamp is opt-in and can be enabled account-wide via `PATCH /v1/account/settings`. When enabled, the capture pipeline requests a second timestamp from a qualified trust service provider in addition to the standard RFC 3161 timestamp. Both timestamps cover the same `bundleHash`, so both are independently verifiable. The qualified timestamp carries the legal weight of a qualified electronic timestamp under eIDAS Article 41 and is relevant for evidence in EU legal proceedings. See [Legal Evidence](/legal-evidence/) for how this maps to specific legal standards.

</details>

---

For detailed endpoint documentation see [API Reference](/api-reference/). For how these properties map to legal authentication standards see [Legal Evidence](/legal-evidence/). For the full verification protocol see [Verification](/verification/). For security architecture and threat model see [Security & Compliance](/security/).
