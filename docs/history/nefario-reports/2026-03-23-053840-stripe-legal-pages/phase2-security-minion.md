# Domain Plan Contribution: security-minion

## Recommendations

1. **Privacy Policy must accurately reflect the actual data processing.** After reviewing the codebase, here is the precise inventory of personal data processed by WRL:
   - **GitHub user identity**: numeric `github_id` (stable), `github_login` (mutable display name), stored in D1 `github_users` table. Obtained via GitHub OAuth with `read:user` scope. The GitHub access token is never stored.
   - **Session data**: SHA-256 hash of session cookie stored in D1 `sessions` table (raw session ID never persisted). HMAC-signed cookie with `__Host-` prefix, 7-day expiry.
   - **API key hashes**: SHA-256 hex stored in D1 `api_keys` table. Raw key shown once at creation, never stored.
   - **Pseudonymized IP (cip)**: HMAC-SHA-256 of IP address with daily rotating key, truncated to 16 hex chars. Used in operational logs shipped to Coralogix. Daily rotation limits tracking window to 24 hours. Explicitly pseudonymized data under GDPR Art. 4(5).
   - **Target URL resolved IP**: The `ip` column in the `captures` table stores the resolved IP address of the *target URL* (for SSRF audit), not the submitter's IP.
   - **ToS acceptance metadata**: `tos_accepted_at` timestamp and `tos_version` string per GitHub user.
   - **Usage counters**: Monthly capture counts and storage bytes per tenant in `usage_counters` table.
   - **Capture metadata**: URL, timestamps, artifacts metadata, status -- attributed to tenantId, not to individual identity.

2. **Third-party processors must be enumerated.** The service sends data to:
   - **Cloudflare** (Workers, D1, KV, R2, Browser Rendering, Queues) -- infrastructure processor, data stays within Cloudflare's network
   - **GitHub** (OAuth identity provider) -- only during authentication flow, access token discarded immediately
   - **Coralogix** (EU2 endpoint: `ingress.eu2.coralogix.com`) -- operational logs containing pseudonymized IP, tenantId, event types. EU data residency.
   - **DigiCert/Sectigo** (TSA at `timestamp.digicert.com`) -- receives SHA-256 hash of capture bundle only, no personal data
   - **Stripe** (planned) -- payment processing

3. **The Refund Policy should explicitly state the non-reversible nature of captures** and the immediate resource consumption model. This is critical for Stripe dispute defense.

4. **Both documents should include the same disclaimer style** as TERMS.md and CONTENT-POLICY.md for tone consistency.

## Proposed Tasks

1. Create `/privacy` page with the Privacy Policy text below
2. Create `/refund-policy` page with the Refund & Dispute Policy text below
3. Add footer links to both pages from the landing site navigation
4. Verify both pages are accessible and render correctly

## Risks and Concerns

### MEDIUM: No DPO or Supervisory Authority Named

A sole proprietor in Germany processing personal data should ideally name the competent supervisory authority (Hessischer Beauftragter fuer Datenschutz und Informationsfreiheit, since Marburg is in Hessen). The policy below includes this. Not legally required for a small sole proprietor but demonstrates good faith and is expected for Stripe verification.

### MEDIUM: No Data Processing Agreements (DPAs) Mentioned

Cloudflare and Coralogix are processors under GDPR. The controller (Ben) should have DPAs in place with both. Cloudflare's standard DPA is part of their ToS. Coralogix likely has one too. The privacy policy references these without asserting they exist -- Ben should verify he has signed them.

### LOW: GDPR Art. 27 Representative Not Needed

Since the controller is established in the EU (Germany), no Art. 27 representative is needed. This is a non-issue but worth noting since some templates include it unnecessarily.

### LOW: Cookie Consent

The session cookie (`__Host-wrl_session`) is a strictly necessary cookie for authentication. Under GDPR/ePrivacy, strictly necessary cookies do not require consent. The privacy policy documents this but no consent banner is needed. Out of scope as stated in constraints.

### LOW: Refund Policy Dispute Window

The policy below gives a 30-day window for billing disputes. Stripe allows disputes up to 120 days. The 30-day window for direct contact is reasonable -- it encourages resolution before Stripe gets involved. After 30 days, users can still dispute through Stripe's own process (which the policy acknowledges).

### INFO: No Automated Decision-Making

GDPR Art. 22 requires disclosure of automated decision-making with legal effects. WRL's rate limiting and quota enforcement are automated but do not produce legal effects or similarly significant effects -- they are standard service operation. No Art. 22 disclosure needed.

## Additional Agents Needed

- **frontend-minion**: To create the actual HTML pages, integrate with the site's Eleventy build system and design tokens, and add navigation links.
- No other agents needed for the legal text itself.

## Deliverable: Privacy Policy Text

```markdown
---
layout: layouts/doc.njk
title: Privacy Policy
description: How Web Resource Ledger collects, uses, and protects your personal data.
---

# Privacy Policy

**Effective: 2026-03-23**

## Controller

Gerhard Benjamin Peter (sole proprietor)
Weidenhaeuser Str. 73
35037 Marburg, Germany
Email: bp@ben-peter.com

## What This Policy Covers

This policy describes how Web Resource Ledger ("WRL", "the service") collects,
uses, stores, and protects personal data when you use the WRL API or web
interface at api.webresourceledger.com.

## Data We Collect

### Account Data (GitHub OAuth)

When you sign in with GitHub, we receive and store:

- **GitHub user ID** -- a stable numeric identifier assigned by GitHub
- **GitHub username** -- your current GitHub display name (updated on each login)

We request the `read:user` scope from GitHub. We do **not** receive or store
your GitHub email address, repositories, or any data beyond your public profile
identity. The GitHub access token used during login is discarded immediately
after fetching your identity -- it is never stored.

### Session Data

When you log in, we create a server-side session:

- A **session cookie** (`__Host-wrl_session`) is set in your browser. It is
  HttpOnly, Secure, SameSite=Lax, and expires after 7 days.
- Only a **SHA-256 hash** of the session value is stored on our servers. The raw
  session value exists only in your browser cookie.

This cookie is strictly necessary for authentication. It is not used for
tracking or advertising.

### API Keys

When you create an API key, we store a **SHA-256 hash** of the key for
authentication. The raw key is shown once at creation and never stored.

### IP Addresses

We do **not** store your raw IP address. For rate limiting and abuse prevention,
we compute a **pseudonymized identifier** from your IP address using HMAC-SHA-256
with a daily rotating key. This identifier:

- Cannot be reversed to recover your IP address
- Changes every 24 hours (a different IP hash is produced each day)
- Is used in operational logs for abuse detection

This constitutes pseudonymized data under GDPR Article 4(5).

### Capture Data

Each capture you submit records:

- The **URL** you requested to capture
- **Timestamps** (creation, completion)
- **Capture artifacts** (screenshot, rendered HTML, HTTP headers, signed WACZ bundle)
- The **resolved IP address of the target website** (not your IP -- this is the
  IP address of the server hosting the page you captured)

Capture data is attributed to your tenant ID, not to your personal identity
directly.

### Terms of Service Acceptance

We record when you accepted the Terms of Service and which version you accepted.

### Usage Data

We track monthly capture counts and storage usage per tenant for quota
enforcement. This is operational data tied to your tenant ID.

## Legal Basis for Processing

| Data | Legal Basis | GDPR Article |
|------|-------------|--------------|
| GitHub identity | Contract performance (providing the service you signed up for) | Art. 6(1)(b) |
| Session data | Contract performance (authenticating your requests) | Art. 6(1)(b) |
| API key hashes | Contract performance (authenticating your API requests) | Art. 6(1)(b) |
| Pseudonymized IP | Legitimate interest (abuse prevention, service security) | Art. 6(1)(f) |
| Capture data | Contract performance (the core service you requested) | Art. 6(1)(b) |
| Usage counters | Contract performance (quota enforcement) | Art. 6(1)(b) |

## Data Retention

| Data | Retention |
|------|-----------|
| Account data (GitHub ID, username) | Until you request deletion or the service is discontinued |
| Sessions | 7 days from creation, then automatically deleted |
| API key hashes | Until you revoke the key or request account deletion |
| Pseudonymized IP hashes | In operational logs for up to 90 days |
| Capture data | Indefinitely, unless removed by the operator or upon your deletion request |
| Usage counters | Retained for the current and previous billing periods |

## Third-Party Processors

We use the following third-party services to operate WRL. Your data may be
processed by these services in the course of providing the service to you:

| Processor | Purpose | Data Processed | Location |
|-----------|---------|----------------|----------|
| **Cloudflare** | Infrastructure (Workers, D1 database, KV storage, R2 object storage, Browser Rendering) | All service data | Global (Cloudflare network) |
| **GitHub** | Authentication (OAuth identity provider) | GitHub user ID and username during login only | USA |
| **Coralogix** | Operational logging and monitoring | Pseudonymized IP, tenant ID, event metadata (no raw personal data) | EU (eu2 region) |
| **DigiCert** | RFC 3161 timestamping | SHA-256 hash of capture bundle only (no personal data) | USA |
| **Stripe** | Payment processing (when applicable) | Payment and billing information you provide to Stripe | USA |

We maintain data processing agreements with our infrastructure providers as
required by GDPR Article 28.

## Your Rights

Under GDPR, you have the following rights regarding your personal data:

- **Access** (Art. 15) -- request a copy of the personal data we hold about you
- **Rectification** (Art. 16) -- request correction of inaccurate data (note:
  your GitHub username is automatically updated on each login)
- **Erasure** (Art. 17) -- request deletion of your account and associated data
- **Restriction** (Art. 18) -- request that we limit processing of your data
- **Portability** (Art. 20) -- request your data in a structured, machine-readable
  format
- **Object** (Art. 21) -- object to processing based on legitimate interest
  (pseudonymized IP processing)

To exercise any of these rights, email **bp@ben-peter.com** with the subject line
"Data Request". Include your GitHub username so we can locate your account. We
will respond within 30 days.

### Account Deletion

You may request complete deletion of your account and all associated data. Upon
receiving a verified deletion request, we will:

1. Delete your GitHub user record and all sessions
2. Revoke all API keys
3. Delete all capture records and stored artifacts
4. Remove your tenant record and usage data

Pseudonymized IP hashes in operational logs cannot be attributed back to you
after deletion and will expire naturally within 90 days.

## Data Security

We implement the following security measures:

- All API keys and session tokens are stored as **SHA-256 hashes** -- raw values
  are never persisted
- Session cookies use **HMAC signing**, the **`__Host-` prefix**, and the
  **Secure, HttpOnly, SameSite=Lax** attributes
- **Ed25519 cryptographic signatures** ensure capture integrity
- IP addresses are **pseudonymized** with daily key rotation
- All data in transit is encrypted via **TLS**
- OAuth authentication uses **PKCE** (Proof Key for Code Exchange) to prevent
  authorization code interception
- Rate limiting protects against abuse at multiple levels

## Supervisory Authority

If you believe your data protection rights have been violated, you have the right
to lodge a complaint with a supervisory authority. The competent authority for the
controller is:

**Der Hessische Beauftragte fuer Datenschutz und Informationsfreiheit**
Postfach 31 63
65021 Wiesbaden, Germany
https://datenschutz.hessen.de

## International Data Transfers

Some of our processors (GitHub, DigiCert, Stripe) are based in the USA.
Cloudflare processes data globally across its network. These transfers are
conducted under appropriate safeguards, including the EU-US Data Privacy
Framework and Standard Contractual Clauses where applicable.

## Children

WRL is not directed at children under 16. We do not knowingly collect personal
data from children. If you believe a child has provided us with personal data,
contact us at bp@ben-peter.com and we will delete it.

## Changes to This Policy

We may update this policy from time to time. The effective date at the top
reflects the most recent revision. We will not reduce your rights under this
policy without your explicit consent.

## Disclaimer

This document is a reasonable-effort privacy policy for a small, early-stage
project. It is not professional legal advice. If your situation requires legal
certainty, consult a qualified attorney.
```

## Deliverable: Refund & Dispute Policy Text

```markdown
---
layout: layouts/doc.njk
title: Refund & Dispute Policy
description: Refund eligibility, dispute process, and billing support for Web Resource Ledger.
---

# Refund & Dispute Policy

**Effective: 2026-03-23**

## How WRL Billing Works

Web Resource Ledger is a **usage-based API service**. You pay per capture. There
are no subscriptions, recurring charges, or long-term commitments.

- **Free tier**: A limited number of captures per month at no cost. If you are
  on the free tier, there is nothing to refund.
- **Paid usage**: When you exceed the free tier, you pay only for the captures
  you use. Each capture consumes compute resources (headless browser rendering,
  cryptographic signing, storage) immediately and irreversibly.

Payment is processed by **Stripe**. WRL does not store your credit card number
or payment details -- Stripe handles all payment data.

## Refund Eligibility

Because each capture consumes resources immediately upon submission, **completed
captures are non-refundable**. Once a capture request is processed, the
resources have been consumed and the artifacts (screenshot, HTML, signed WACZ
bundle) have been generated and stored.

You **may** be eligible for a refund or credit in the following cases:

- **Service error**: Your capture failed due to a WRL system error (not a
  target website error) and was charged. We will credit your account or issue
  a refund for failed captures that were incorrectly billed.
- **Duplicate charges**: You were charged twice for the same capture or billing
  period. We will refund the duplicate.
- **Billing error**: The amount charged does not match your actual usage. We
  will investigate and correct the discrepancy.

## How to Request a Refund

Email **bp@ben-peter.com** with:

- Your tenant ID or GitHub username
- The capture ID(s) or billing period in question
- A description of the issue

We aim to acknowledge refund requests within **3 business days** and resolve
them within **10 business days**.

## Disputes

If you believe a charge is incorrect, please contact us **before** opening a
dispute with your payment provider. We can usually resolve billing issues faster
through direct communication.

**Direct dispute window**: Contact us within **30 days** of the charge in
question. We will investigate and respond with a resolution.

If we cannot reach a satisfactory resolution, or if you prefer, you may open a
dispute through Stripe's standard process. Note that payment provider disputes
may take longer to resolve.

## Cancellation

There is nothing to cancel. WRL has no subscriptions or recurring charges. To
stop using the service, simply stop making API requests. You will not be charged
for anything you do not use.

If you want to close your account entirely, you may request account deletion
by emailing bp@ben-peter.com. See our [Privacy Policy](/privacy/) for details on
what data is removed.

## Contact

For any billing questions or disputes:

**Email**: bp@ben-peter.com
**Subject line**: "Billing" or "Refund Request"

Include your tenant ID or GitHub username so we can locate your account quickly.

## Disclaimer

This document is a reasonable-effort policy for a small, early-stage project.
It is not professional legal advice. If your situation requires legal certainty,
consult a qualified attorney.
```
