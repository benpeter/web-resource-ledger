---
layout: layouts/doc.njk
title: Subprocessors
description: Third-party services that process data on behalf of WRL and its customers.
---

# Subprocessors

Last updated: 2026-03-25

> **What this page is:** WRL runs on Cloudflare's infrastructure and integrates with a small set of external services to authenticate users, process payments, send email, screen URLs for threats, and issue cryptographic timestamps. This page lists every third-party service that processes data on behalf of WRL or its customers, what data each service receives, and the legal mechanism that governs the transfer. No service receives personal data beyond what is strictly necessary for its function.

## Subprocessor changes

WRL will notify account contacts by email at least 30 days before adding a new subprocessor that receives personal data. Changes that reduce the scope of data shared (for example, removing a subprocessor) take effect immediately and are reflected here on the same day.

If you object to a planned addition, contact [bp@ben-peter.com](mailto:bp@ben-peter.com) before the 30-day notice period expires.

---

## Current subprocessors

### Cloudflare

**Entity:** Cloudflare, Inc. (USA)
**Purpose:** Infrastructure — compute (Workers), relational database (D1), key-value store (KV), object storage (R2), headless browser rendering, and message queues
**Data processed:** All service data, including capture artifacts, account records, session state, and operational logs
**Data location:** Global (processed at the nearest Cloudflare point of presence; data stored in the primary region configured for each product)
**Transfer mechanism:** EU-US Data Privacy Framework + Standard Contractual Clauses
**DPA / Privacy:** [cloudflare.com/trust-hub/gdpr](https://www.cloudflare.com/trust-hub/gdpr/)

---

### GitHub

**Entity:** GitHub, Inc. (USA), a Microsoft subsidiary
**Purpose:** OAuth authentication — WRL uses GitHub as its identity provider
**Data processed:** GitHub user ID, GitHub username, and primary verified email address (via `read:user user:email` OAuth scopes). The GitHub access token is used once to fetch identity, then discarded and never stored.
**Data location:** USA
**Transfer mechanism:** EU-US Data Privacy Framework + Standard Contractual Clauses
**DPA / Privacy:** [docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement](https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement)

---

### Stripe

**Entity:** Stripe, Inc. (USA)
**Purpose:** Payment processing
**Data processed:** Customer identifier, payment methods, invoices, and metered usage events. Payment card data is entered directly into Stripe's hosted fields and never passes through WRL's systems.
**Data location:** USA
**Transfer mechanism:** EU-US Data Privacy Framework + Standard Contractual Clauses
**DPA / Privacy:** [stripe.com/en-de/legal/dpa](https://stripe.com/en-de/legal/dpa)

---

### DigiCert

**Entity:** DigiCert, Inc. (USA)
**Purpose:** RFC 3161 timestamping — WRL submits a SHA-256 hash of each WACZ bundle to DigiCert's timestamp authority to obtain a signed proof of the capture time
**Data processed:** SHA-256 hash of the WACZ bundle only. No personal data is transmitted.
**Data location:** USA
**Transfer mechanism:** No personal data transferred
**DPA / Privacy:** [digicert.com/legal/privacy-policy](https://www.digicert.com/legal/privacy-policy/)

---

### Sectigo

**Entity:** Sectigo Limited (USA)
**Purpose:** eIDAS-qualified RFC 3161 timestamping — WRL submits a SHA-256 hash of each WACZ bundle to Sectigo's qualified timestamp authority (EU Trust List) when eIDAS timestamps are enabled for a tenant
**Data processed:** SHA-256 hash of the WACZ bundle only. No personal data is transmitted.
**Data location:** USA
**Transfer mechanism:** No personal data transferred
**DPA / Privacy:** [sectigo.com/privacy-policy](https://sectigo.com/privacy-policy)

---

### Coralogix

**Entity:** Coralogix Ltd. (Israel / EU operations)
**Purpose:** Operational logging, monitoring, and alerting
**Data processed:** Pseudonymized IP identifiers (HMAC-SHA-256 with a daily rotating key — not reversible to the original IP), tenant IDs, capture event metadata, and Worker error traces. Raw IP addresses and email addresses are never logged.
**Data location:** EU (Coralogix EU2 region, Frankfurt)
**Transfer mechanism:** EU processing (no transfer outside the EU for this region)
**DPA / Privacy:** [coralogix.com/legal/privacy-policy](https://coralogix.com/legal/privacy-policy/)

---

### Resend

**Entity:** Resend, Inc. (USA)
**Purpose:** Transactional email delivery — WRL sends notifications such as capture failures, quota alerts, invoices, and email verification messages through Resend
**Data processed:** Recipient email addresses and email content (notification text). Email addresses are never logged by WRL; they pass directly to Resend in queue messages.
**Data location:** USA
**Transfer mechanism:** Standard Contractual Clauses
**DPA / Privacy:** [resend.com/legal/dpa](https://resend.com/legal/dpa)

---

### Google (Web Risk API)

**Entity:** Google LLC (USA)
**Purpose:** URL threat screening — WRL checks submitted URLs against Google's Web Risk threat intelligence before initiating a capture
**Data processed:** The URL submitted for capture. URLs may contain personal data if query strings include identifiable information (for example, a URL with a name or email address as a parameter).
**Data location:** USA
**Transfer mechanism:** EU-US Data Privacy Framework + Standard Contractual Clauses
**DPA / Privacy:** [cloud.google.com/terms/data-processing-addendum](https://cloud.google.com/terms/data-processing-addendum)
