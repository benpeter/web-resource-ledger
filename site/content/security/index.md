---
layout: layouts/doc.njk
title: Security and Compliance
description: Web capture security and compliance — whitepaper, DPA, subprocessors, incident response policy, and data retention for enterprise buyers.
---

# Security and Compliance

WRL's approach to security documentation is honest disclosure over marketing claims. Every technical assertion in these documents is verifiable against the public codebase at [github.com/benpeter/web-resource-ledger](https://github.com/benpeter/web-resource-ledger). Where WRL cannot make a claim — no SOC 2 certification, no 24/7 SOC, no physical isolation between tenants — the documents say so explicitly. Enterprise buyers should read these documents as technical evidence, not as sales material.

---

## Security Whitepaper

The whitepaper is the primary technical reference for WRL's security architecture. It covers the full system architecture, data classification and handling, authentication model (API keys, GitHub OAuth PKCE, admin credentials), encryption in transit and at rest, tenant isolation model, SSRF prevention controls, content threat screening, incident detection, supply chain controls, GDPR and eIDAS compliance posture, and a complete inventory of known residual risks with their mitigations. Every claim cites the source file that implements it. Security engineers, procurement teams, and enterprise architects evaluating WRL should start here.

[Read the Security Whitepaper](/security/whitepaper/)

---

## Data Processing Agreement (DPA)

The DPA is a GDPR Article 28 agreement for enterprise customers who need a formal processor contract. It defines WRL's role as data processor, specifies the categories of personal data processed (captured URLs, page content, pseudonymized IP addresses, GitHub identity for dashboard users), documents the technical and organizational measures in place, covers sub-processor management with 30-day advance notice of changes, and commits to 48-hour breach notification. The DPA is a template; both parties must execute a signed version. Legal counsel should review before execution.

[Read the Data Processing Agreement](/security/dpa/)

---

## Subprocessor List

This page lists every third-party service that processes data on behalf of WRL or its customers, including the data each service receives, its location, and the legal transfer mechanism. Current subprocessors are Cloudflare (all infrastructure), GitHub (OAuth identity), Stripe (payments), Coralogix (operational logs, EU region), Resend (transactional email), DigiCert (RFC 3161 timestamps), Sectigo (eIDAS-qualified timestamps), and Google Web Risk (URL threat screening). DigiCert and Sectigo receive no personal data — only a SHA-256 hash of the capture bundle. WRL will give 30 days' notice before adding any subprocessor that receives personal data.

[Read the Subprocessor List](/security/subprocessors/)

---

## Incident Response

This document describes how WRL detects and responds to security incidents. Detection relies on nine Coralogix alert rules covering capture failures, 5xx errors, authentication anomalies, and threat screening failures. WRL is sole-proprietor operated with no 24/7 SOC; the document is explicit about what this means for response times. In the event of a confirmed personal data breach, WRL commits to notifying affected customers within 48 hours and the supervisory authority within 72 hours (GDPR Articles 33 and 34). The document includes a breach assessment decision tree and a severity classification table. Customers whose security review requires SLA commitments should read Section on Operational Model carefully.

[Read the Incident Response Policy](/security/incident-response/)

---

## Data Retention and Deletion

This document specifies how long WRL retains each category of data and what happens when an account is deleted. Capture data is retained indefinitely while an account is active — this is the product's purpose. Sessions, rate limit counters, and OAuth state tokens expire automatically within minutes to days. Account deletion follows a two-phase process: immediate block on new captures, followed by permanent deletion of all artifacts, metadata, and account records 30 days later. Deletion is currently operator-initiated via support request; self-service deletion is planned. Coralogix operational logs are pseudonymized and expire automatically within 90 days.

[Read the Data Retention and Deletion Policy](/security/data-retention/)

---

## Privacy Policy

The Privacy Policy covers the full data inventory, the legal basis for each processing activity, and GDPR rights for data subjects. Unlike the DPA (which is a contract between WRL and enterprise customers as processors), the Privacy Policy addresses WRL's relationship with the individuals whose data it processes as controller.

[Read the Privacy Policy](https://webresourceledger.com/privacy)
