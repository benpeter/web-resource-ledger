---
layout: layouts/doc.njk
title: Architecture
description: How WRL captures web pages, builds cryptographic proof bundles, and enables independent verification.
---

# Architecture

This page explains how WRL works under the hood -- the flows a tenant API consumer sees, and the internal pipeline that produces tamper-evident captures. It is aimed at technical evaluators who want to understand the system before integrating or before presenting captures as evidence.

## User Interaction Flows

The sequence diagram below shows the four interaction patterns available to API consumers: authenticating (via GitHub OAuth or API key), submitting captures (single or batch), polling for results, and verifying a completed capture.

```mermaid
sequenceDiagram
    actor Tenant as Tenant (API Consumer)
    participant API as WRL API
    participant DB as Database
    participant Q as Queue
    participant Browser as Browser Rendering
    participant Storage as Object Storage
    participant Verifier as Verifier

    note over Tenant,API: Authentication -- two paths

    alt GitHub OAuth (interactive / web UI)
        Tenant->>API: GET /auth/login
        API-->>Tenant: Redirect to GitHub (PKCE)
        Tenant->>API: GET /auth/callback?code=...
        API-->>Tenant: Session cookie
    else API Key (programmatic)
        note over Tenant,API: Bearer token in Authorization header
    end

    note over Tenant,Q: Capture lifecycle (single or batch)

    alt Single capture
        Tenant->>API: POST /v1/captures
    else Batch capture
        Tenant->>API: POST /v1/captures/batch
    end

    API->>DB: Record capture(s) as pending
    API->>Q: Enqueue capture job(s)
    API-->>Tenant: 202 Accepted + capture ID(s)

    note over Q,Storage: Async processing (see pipeline diagram)
    Q->>Browser: Render URL
    Browser->>Storage: Store artifacts
    Q->>DB: Mark complete

    Tenant->>API: GET /v1/captures/{id}/status
    API-->>Tenant: {status: "complete"}
    Tenant->>API: GET /v1/captures/{id}
    API-->>Tenant: Capture record + artifact URLs + verifyUrl

    note over Tenant,Verifier: Verification (unauthenticated by design)

    Verifier->>API: GET /v1/verify/{id}
    API->>Storage: Fetch WACZ bundle
    API->>DB: Resolve signing key by keyId
    API-->>Verifier: 5 check results + verified flag

    opt Download certificate (PDF)
        Verifier->>API: GET /v1/captures/{id}/certificate
        API-->>Verifier: PDF certificate
    end

    note over Tenant,API: Account management (brief)
    note over Tenant,API: API key CRUD: /v1/account/keys
    note over Tenant,API: Webhooks: /v1/webhooks
    note over Tenant,API: eIDAS opt-in: PATCH /v1/account/settings
```

The verify endpoint is intentionally unauthenticated -- any third party can verify a capture without an account. The verification decision is driven by five independent checks run against the WACZ bundle itself (see [Verification](/verification/) for details). Signing key resolution uses the server's authoritative key store via `/.well-known/signing-key(s)`, not the key embedded in the bundle.

## Capture Pipeline & Integrity Chain

The flowchart below traces a single capture from HTTP ingestion through browser rendering to the final signed WACZ bundle in storage.

```mermaid
flowchart TD
    subgraph Ingestion
        A([HTTP Request]) --> B[Authentication]
        B --> C[Rate Limiting]
        C --> D[Quota Check]
        D --> E["URL Validation<br/>SSRF prevention"]
        E --> F["Threat Screening<br/>Google Web Risk"]
        F --> G[("Database<br/>pending record")]
        G --> H[Queue]
        H --> I([202 Accepted])
    end

    subgraph Processing
        H --> J["Browser Rendering<br/>headless Chromium"]
        J --> K[Screenshot before consent]
        K --> L["Cookie Consent Dismissal<br/>autoconsent"]
        L --> M[Screenshot after consent]
        M --> N[Rendered HTML + HTTP Headers]
    end

    subgraph WACZ["WACZ Assembly & Integrity Chain"]
        N --> O[Build WARC archive]
        O --> P["SHA-256 each artifact<br/>WARC · CDXJ · pages.jsonl"]
        P --> Q["datapackage.json manifest<br/>resources array with hashes"]
        Q --> R["bundleHash =<br/>SHA-256 of canonical JSON"]
        R --> S["Ed25519 signature<br/>over bundleHash bytes"]
        R --> T["RFC 3161 timestamp<br/>from independent TSA"]
        R --> U["eIDAS qualified timestamp<br/>from qualified TSA"]
        S --> V["datapackage-digest.json<br/>signatures array"]
        T --> V
        U --> V
        V --> W[WACZ ZIP bundle]
    end

    subgraph Completion
        W --> X[("Object Storage<br/>hash-addressed")]
        X --> Y[("Database<br/>complete record")]
        Y --> Z([Webhook dispatch])
    end

    subgraph Verification
        W -.->|independent check| AA{5 checks}
        AA --> AB["artifactHashes<br/>each file matches manifest hash"]
        AA --> AC["bundleHash<br/>SHA-256 of canonical manifest"]
        AA --> AD["signature<br/>Ed25519 via server key lookup"]
        AA --> AE["timestamp<br/>RFC 3161 messageImprint"]
        AA --> AF["qualifiedTimestamp<br/>eIDAS messageImprint"]
        AD -.->|key resolved from| AG["/.well-known/signing-key"]
    end

    style WACZ fill:#f0f4ff,stroke:#6b7adc
    style Verification fill:#f0fff4,stroke:#4caf7d
```

The diagram highlights two design decisions that matter for trust.

**The integrity chain.** Every artifact file is hashed individually. Those hashes go into `datapackage.json`. The canonical JSON of that manifest is hashed to produce `bundleHash`. Then `bundleHash` is signed and timestamped. All three attestations (Ed25519 signature, RFC 3161 timestamp, and optional eIDAS qualified timestamp) cover the same `bundleHash` -- they are siblings in the `signatures` array, not a sequential chain. Any modification to any artifact at any level breaks the `bundleHash` and invalidates all attestations at once.

**Key resolution.** Verification uses the server's current public key (fetched from `/.well-known/signing-key`) to verify the signature. The public key embedded in the WACZ bundle is informational only and is never trusted for the verification decision. Historical keys remain available at `/.well-known/signing-keys` so that captures signed under a rotated key continue to verify indefinitely.

<details>
<summary>eIDAS qualified timestamps</summary>

RFC 3161 timestamps are included in every capture by default. The eIDAS qualified timestamp is opt-in and can be enabled account-wide via `PATCH /v1/account/settings`. When enabled, the capture pipeline requests a second timestamp from a qualified trust service provider in addition to the standard RFC 3161 timestamp. Both timestamps cover the same `bundleHash`, so both are independently verifiable. The qualified timestamp carries the legal weight of a qualified electronic timestamp under eIDAS Article 41 and is relevant for evidence in EU legal proceedings. See [Legal Evidence](/legal-evidence/) for how this maps to specific legal standards.

</details>

---

For detailed endpoint documentation see [API Reference](/api-reference/). For how these properties map to legal authentication standards see [Legal Evidence](/legal-evidence/). For the full verification protocol see [Verification](/verification/). For security architecture and threat model see [Security & Compliance](/security/).
