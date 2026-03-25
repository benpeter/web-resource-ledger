---
layout: layouts/doc.njk
title: Data Processing Agreement
description: GDPR Article 28 Data Processing Agreement template for WRL enterprise customers.
---

# Data Processing Agreement

> **Legal disclaimer:** This is a reasonable-effort template prepared for enterprise customers of Web Resource Ledger. It is not professional legal advice. Before executing this agreement, both parties should have it reviewed by qualified legal counsel.

---

This Data Processing Agreement ("DPA") is entered into between:

**Controller:** `[Customer Name]`, with its principal place of business at `[Customer Address]` ("Customer")

**Processor:** Gerhard Benjamin Peter (sole proprietor), trading as Web Resource Ledger, Weidenhäuser Str. 73, 35037 Marburg, Germany ("WRL")

**Effective Date:** `[Effective Date]`

**Customer Contact for data protection matters:** `[Customer Contact]`

This DPA supplements and is incorporated into the WRL Terms of Service or any separate enterprise service agreement between the parties. In the event of a conflict between this DPA and those terms, this DPA governs with respect to the processing of personal data.

---

## 1. Definitions

**"Controller"** means the party that determines the purposes and means of processing personal data. For purposes of this DPA, the Customer is the Controller.

**"Processor"** means the party that processes personal data on behalf of the Controller. For purposes of this DPA, WRL is the Processor.

**"Personal data"** has the meaning given in GDPR Article 4(1): any information relating to an identified or identifiable natural person.

**"Processing"** has the meaning given in GDPR Article 4(2): any operation or set of operations performed on personal data, whether or not by automated means.

**"Sub-processor"** means any third party engaged by WRL to process personal data on behalf of the Customer. A list of current sub-processors is maintained at Annex C.

**"Data subjects"** means the natural persons whose personal data is processed under this DPA.

**"GDPR"** means Regulation (EU) 2016/679 of the European Parliament and of the Council.

**"Standard Contractual Clauses" or "SCCs"** means the standard data protection clauses adopted by the European Commission under GDPR Article 46(2)(c).

**"Supervisory authority"** means the competent data protection authority. For WRL, the competent authority is Der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Wiesbaden, Germany.

---

## 2. Subject Matter and Duration

WRL processes personal data solely to provide the web capture service to the Customer as described in Annex A. WRL acts as a Processor within the meaning of GDPR Article 28 and processes personal data only on documented instructions from the Customer, except where required to do otherwise by applicable law.

This DPA remains in effect for as long as WRL processes personal data on behalf of the Customer. It terminates automatically upon expiry or termination of the underlying service agreement, subject to the data return and deletion obligations in Section 11.

---

## 3. Nature and Purpose of Processing

WRL performs the following processing activities on behalf of the Customer:

- Accepting URLs submitted by the Customer via API call and initiating headless browser capture of the requested pages
- Storing capture artifacts (screenshot, rendered HTML, HTTP response headers, signed WACZ bundle) in object storage attributed to the Customer's tenant
- Generating cryptographic integrity signatures and RFC 3161 timestamps for capture bundles
- Providing Customer access to capture artifacts and metadata via authenticated API and web interface
- Routing capture requests through URL threat screening before processing
- Sending transactional notifications to the Customer contact on events such as capture failures or quota alerts

All processing is performed solely on documented Customer instructions, which are expressed through authenticated API calls and dashboard configuration. WRL does not determine the purposes of the underlying capture operations; the Customer determines which URLs to capture and for what purpose.

---

## 4. Categories of Data Subjects

The categories of data subjects whose personal data may be processed under this DPA are:

- Individuals whose personal data appears in the content of web pages submitted for capture by the Customer

The Customer is responsible for determining which URLs are submitted for capture and is therefore best placed to identify the data subjects whose personal data may be affected. WRL processes the captured content without knowledge of or control over the identity of those individuals.

If the Customer uses the WRL web dashboard, the Customer's authorized users (identified by GitHub username) are also data subjects with respect to their account and authentication data.

---

## 5. Categories of Personal Data

The categories of personal data that may be processed under this DPA include:

- **URLs submitted for capture**, which may contain personal data embedded in path segments or query parameters (for example, a URL containing a name, email address, or account identifier)
- **Captured page content**, including rendered HTML, screenshots, and HTTP response headers, which may contain personal data present on the captured web page
- **Pseudonymized requestor IP address**, derived by HMAC-SHA-256 with a daily rotating key; the original IP address is not stored or transmitted
- **GitHub identity data** (GitHub user ID, GitHub username) if Customer personnel access WRL via the web dashboard

WRL does not receive, process, or store raw IP addresses. Pseudonymized IP identifiers appear only in operational logs and are not reversible to the original address.

Special categories of personal data (GDPR Article 9) may appear in captured page content if the Customer submits URLs containing such content. The Customer is responsible for ensuring an appropriate legal basis exists for any such processing.

---

## 6. Customer Obligations

The Customer, as Controller, is responsible for:

**Lawful basis.** Ensuring that a valid legal basis under GDPR Article 6 exists for each capture submission. WRL processes URLs on instruction; the Customer determines the purpose and bears responsibility for the lawfulness of each capture.

**Special category data.** Ensuring that any submission of URLs whose content may include special categories of personal data (GDPR Article 9) is supported by an appropriate condition under Article 9(2).

**Data subject rights.** Responding to data subject requests. Where a data subject request concerns data held by WRL as Processor, the Customer may request WRL's cooperation under Section 7.

**Accuracy and scope.** Not submitting URLs that contain more personal data than is necessary for the Customer's documented purpose, consistent with the principle of data minimization.

**Notification.** Promptly notifying WRL if the Customer becomes aware of any circumstances that affect the lawfulness of processing under this DPA.

---

## 7. Processor Obligations

WRL, as Processor, commits to the following:

**Processing on instruction.** WRL will process personal data only on documented instructions from the Customer, unless required to do so by applicable law. If WRL is required by law to process personal data in a manner other than as instructed, WRL will inform the Customer before such processing unless the law prohibits disclosure.

**Confidentiality.** WRL will ensure that all personnel authorized to process personal data are subject to binding confidentiality obligations.

**Security.** WRL will implement and maintain the technical and organizational measures described in Annex B to protect personal data against unauthorized or unlawful processing and accidental loss, destruction, or damage.

**Sub-processor management.** WRL will not engage new sub-processors without prior notice to the Customer in accordance with Section 8.

**Cooperation with data subject rights.** WRL will assist the Customer, insofar as technically possible, in fulfilling the Customer's obligations to respond to requests from data subjects exercising their rights under GDPR Chapter III. Requests should be directed to [bp@ben-peter.com](mailto:bp@ben-peter.com).

**Cooperation with supervisory authorities.** WRL will cooperate with supervisory authorities in the performance of their tasks, and will notify the Customer promptly of any supervisory authority inquiry or investigation relating to the processing performed under this DPA.

**Data protection impact assessments.** Where requested by the Customer, WRL will provide reasonable assistance in carrying out data protection impact assessments (GDPR Article 35) and prior consultation with supervisory authorities (Article 36), insofar as such assessments concern processing performed by WRL on the Customer's behalf.

**Notification of unlawful instructions.** If WRL considers that a Customer instruction infringes GDPR or other applicable data protection law, WRL will immediately inform the Customer.

---

## 8. Sub-Processor Management

**Current sub-processors.** WRL's current sub-processors and the data they receive are listed in Annex C. A more detailed profile of each sub-processor, including transfer mechanisms and DPA links, is maintained at [/security/subprocessors/](/security/subprocessors/).

**Notice of changes.** WRL will give the Customer at least 30 days' written notice before adding or replacing any sub-processor that will receive personal data. Notice will be sent to the Customer Contact identified at the top of this DPA and published on the subprocessors page.

**Customer right to object.** The Customer may object to the addition of a new sub-processor by notifying WRL in writing within the 30-day notice period with documented reasons. The parties will work together in good faith to resolve the objection. If the objection cannot be resolved, the Customer may terminate the service agreement without penalty on written notice.

**WRL liability for sub-processors.** WRL remains liable to the Customer for the performance of each sub-processor's obligations under GDPR Article 28(4).

---

## 9. Data Breach Notification

**Detection and confirmation.** WRL maintains automated alerting and structured operational logging to detect potential personal data breaches.

**Notification timeline.** WRL will notify the Customer no later than **48 hours** after WRL has confirmed that a personal data breach has occurred that affects data processed under this DPA. Notification will be sent to the Customer Contact identified at the top of this DPA.

**Notification content.** To the extent known at the time of notification, WRL will include:

- A description of the nature of the breach, including categories and approximate number of data subjects and records affected
- The name and contact details of WRL's data protection contact
- A description of the likely consequences of the breach
- A description of the measures taken or proposed to address the breach

Where complete information is not yet available at the time of initial notification, WRL will provide it in phases as information becomes available.

**Cooperation.** WRL will cooperate with the Customer in the Customer's obligation to notify the relevant supervisory authority (GDPR Article 33) and, where required, affected data subjects (Article 34) within applicable timelines.

**No acknowledgement of fault.** Breach notification under this section does not constitute an acknowledgement of fault or liability by WRL.

---

## 10. Audit Rights

**Compliance questionnaire.** Upon the Customer's written request, WRL will complete a data protection compliance questionnaire within 30 business days. Questionnaire requests are limited to once per 12-month period absent a demonstrated compliance concern.

**Evidence of security measures.** The Customer may request evidence that the technical and organizational measures in Annex B are in place. WRL will provide relevant certifications, audit summaries, or other documentation from its infrastructure providers (including Cloudflare SOC 2 Type II and ISO 27001 where available) within a reasonable timeframe.

**No on-site audit right.** Given the nature of serverless, globally distributed infrastructure, WRL's processing environment is not a physical location that can be audited in the traditional sense. On-site audit rights are therefore not available under this DPA. The evidence-based approach described above is the appropriate mechanism for verifying compliance.

**Costs.** The Customer bears reasonable costs associated with audit activities requested under this section.

---

## 11. Data Return and Deletion

**Export during contract.** During the term of the service agreement, the Customer may export all capture artifacts and metadata at any time via the WRL API. See [/security/data-retention/](/security/data-retention/) and the [API Reference](https://docs.webresourceledger.com/api-reference/) for instructions.

**Post-termination grace period.** Upon expiry or termination of the service agreement, the Customer's account enters a 30-day grace period. During this period, capture data remains accessible for export and no new captures may be submitted.

**Deletion.** At the end of the 30-day grace period, WRL will permanently delete all personal data processed on behalf of the Customer, including capture artifacts, capture metadata, account records, and associated operational data, in accordance with the deletion procedure described at [/security/data-retention/](/security/data-retention/).

**Operational logs.** Pseudonymized IP identifiers in operational logs expire automatically within 90 days. Because they are not reversible to a personal identity, they cannot be attributed to any data subject after the account is deleted.

**Deletion confirmation.** WRL will provide written confirmation of deletion to the Customer Contact within 14 days of the deletion being completed.

**Legal obligation exception.** WRL may retain personal data beyond these periods to the extent required by applicable law, in which case WRL will notify the Customer of the retention and its legal basis.

---

## 12. International Transfers

Processing under this DPA involves the transfer of personal data to sub-processors located outside the European Economic Area. The transfer mechanisms applicable to each sub-processor are described in Annex D.

WRL will not transfer personal data to any country or territory outside the EEA unless one of the transfer mechanisms listed in GDPR Article 46 (or an adequacy decision under Article 45) applies.

---

## 13. Confidentiality

Each party will treat the other party's confidential information with reasonable care and will not disclose it to third parties without prior written consent, except as required by law or to sub-processors bound by equivalent obligations.

---

## 14. Term and Termination

This DPA takes effect on the Effective Date and continues until the service agreement between the parties expires or is terminated. Termination of the service agreement automatically terminates this DPA, subject to the data return and deletion obligations in Section 11, which survive termination.

---

## 15. Liability

Each party's liability under this DPA is subject to the limitations and exclusions in the underlying service agreement or Terms of Service. Nothing in this DPA limits either party's liability to data subjects or supervisory authorities under GDPR.

---

## Signatures

**For the Customer:**

Name: ___________________________

Title: ___________________________

Signature: ___________________________

Date: ___________________________


**For WRL (Processor):**

Name: Gerhard Benjamin Peter

Title: Sole Proprietor, Web Resource Ledger

Signature: ___________________________

Date: ___________________________

---

## Annex A: Description of Processing

| Field | Details |
|---|---|
| **Purpose of processing** | Providing the WRL web capture service: capturing web pages on Customer instruction, storing capture artifacts, generating cryptographic integrity signatures and timestamps, and providing Customer access to those artifacts |
| **Duration** | For the term of the service agreement, plus the 30-day post-termination grace period described in Section 11 |
| **Categories of personal data** | URLs (potentially containing PII), captured page content (HTML, screenshots, HTTP headers), pseudonymized requestor IP address, GitHub identity data for dashboard users |
| **Categories of data subjects** | Individuals whose personal data appears in web pages captured on Customer instruction; Customer personnel who access WRL via the web dashboard |
| **Processing operations** | Receiving capture requests via API; URL threat screening; headless browser rendering; artifact storage; integrity signing and timestamping; artifact retrieval; transactional notification; operational logging (pseudonymized) |
| **Sub-processors** | See Annex C |
| **Transfer mechanisms** | See Annex D |

---

## Annex B: Technical and Organizational Measures

The following measures are in place as of the Effective Date. WRL will not reduce these measures in a way that materially diminishes protection of the Customer's personal data without notice.

### Access Control

**Credential storage.** Authentication credentials (API keys, session tokens) are stored using one-way cryptographic hashing, preventing reconstruction of the original credential from stored data.

**Multi-factor authentication.** Dashboard access requires authentication via GitHub OAuth, which supports multi-factor authentication enforced at the GitHub account level.

**Scope-based authorization.** Each API key carries a defined set of permission scopes (for example, capture-only or read-only). Keys cannot be used to perform operations outside their authorized scope.

**Session expiry.** Authenticated sessions expire automatically after seven days, requiring re-authentication.

**Rate limiting.** Automated controls limit the rate of API requests to prevent unauthorized bulk access to data.

### Pseudonymization

**IP address pseudonymization.** Requestor IP addresses are pseudonymized before any logging or storage using a cryptographic function with a daily rotating key. The pseudonymized identifier cannot be reversed to the original IP address and changes every 24 hours, limiting the period of correlation risk.

### Encryption

**Encryption in transit.** All data transmitted between clients, WRL services, and sub-processors is encrypted using TLS.

**Encryption at rest.** Capture artifacts, database records, and key-value data are stored on Cloudflare infrastructure with platform-managed encryption at rest.

**Cryptographic integrity.** Every capture bundle is digitally signed with an Ed25519 key, providing tamper-evident proof that artifacts have not been modified after capture. RFC 3161 timestamps provide independent, verifiable proof of capture time.

### Integrity and Availability

**Tamper-evident records.** The combination of Ed25519 signatures and RFC 3161 timestamps allows any party to independently verify that a capture artifact is authentic and has not been altered.

**Globally distributed infrastructure.** Capture processing runs on a globally distributed serverless platform, providing inherent resilience against single-location outages.

**Queue-based processing.** Capture requests are processed via a durable message queue with automatic retry, preventing loss of capture jobs due to transient infrastructure failures.

**Graceful degradation.** Non-critical services (timestamping, email notification) degrade gracefully without blocking core capture operations. Security-critical controls (authentication, authorization, URL validation) never degrade.

### Incident Detection and Response

**Automated alerting.** Threshold-based alerts notify WRL of anomalous error rates and processing failures.

**Structured logging.** Operational logs are retained in the EU (Coralogix EU2 region, Frankfurt) for 90 days for incident investigation. Logs are designed to contain no raw personal data: IP addresses are pseudonymized before logging and email addresses are not logged.

**Breach notification.** WRL will notify the Customer within 48 hours of confirming a personal data breach, as described in Section 9.

### Data Minimization

**Token discard.** GitHub OAuth access tokens are used once to verify identity and then discarded. They are never stored.

**Credential visibility.** API keys are displayed to the user once at creation. Only a one-way hash is retained thereafter.

**Minimal identity data.** Dashboard authentication stores only the GitHub user ID and username required for account management. Email addresses, repositories, and other GitHub profile data are not requested or stored.

### Physical Security

WRL operates on a serverless, globally distributed infrastructure with no physical servers under WRL's direct management. Physical security of the underlying infrastructure is the responsibility of Cloudflare, Inc. Cloudflare holds SOC 2 Type II and ISO 27001 certifications, available upon request via the Cloudflare Trust Hub at [cloudflare.com/trust-hub](https://www.cloudflare.com/trust-hub/).

---

## Annex C: Sub-Processor List

The full detailed profile of each sub-processor, including purpose, data processed, transfer mechanism, and DPA links, is maintained at [/security/subprocessors/](/security/subprocessors/). The summary below reflects the current list as of the DPA Effective Date.

| Sub-Processor | Entity | Purpose | Data Location | Transfer Mechanism / DPA Status |
|---|---|---|---|---|
| Cloudflare | Cloudflare, Inc. (USA) | All infrastructure: compute, database, object storage, KV, browser rendering, queues | Global (primarily EU where configured) | EU-US DPF + SCCs; DPA in place |
| GitHub | GitHub, Inc. (USA) | OAuth authentication (identity provider) | USA | EU-US DPF + SCCs; DPA in place |
| Stripe | Stripe, Inc. (USA) | Payment processing | USA | EU-US DPF + SCCs; DPA in place |
| Coralogix | Coralogix Ltd. (Israel / EU operations) | Operational logging and monitoring | EU (Frankfurt, EU2 region) | EU processing; DPA in place |
| Resend | Resend, Inc. (USA) | Transactional email delivery | USA | SCCs; DPA in place |
| DigiCert | DigiCert, Inc. (USA) | RFC 3161 timestamping (standard) | USA | No personal data transferred |
| Sectigo | Sectigo Limited (USA) | eIDAS-qualified RFC 3161 timestamping | USA | No personal data transferred |
| Google (Web Risk API) | Google LLC (USA) | URL threat screening | USA | EU-US DPF + SCCs; DPA in place |

WRL will notify the Customer at least 30 days before adding a new sub-processor that receives personal data, in accordance with Section 8.

---

## Annex D: International Transfer Mechanisms

| Sub-Processor | Transfer Mechanism |
|---|---|
| Cloudflare, Inc. (USA) | EU-US Data Privacy Framework adequacy decision + Standard Contractual Clauses (Cloudflare DPA) |
| GitHub, Inc. (USA) | EU-US Data Privacy Framework adequacy decision + Standard Contractual Clauses (GitHub DPA) |
| Stripe, Inc. (USA) | EU-US Data Privacy Framework adequacy decision + Standard Contractual Clauses (Stripe DPA) |
| Google LLC (USA) — Web Risk API | EU-US Data Privacy Framework adequacy decision + Standard Contractual Clauses (Google Cloud DPA) |
| Resend, Inc. (USA) | Standard Contractual Clauses (Resend DPA) |
| Coralogix Ltd. | No transfer outside the EU: data is processed and stored in the EU2 region (Frankfurt, Germany) |
| DigiCert, Inc. (USA) | No personal data transferred; only a SHA-256 hash of the capture bundle is submitted |
| Sectigo Limited (USA) | No personal data transferred; only a SHA-256 hash of the capture bundle is submitted |

Where the EU-US Data Privacy Framework is listed as the primary mechanism, Standard Contractual Clauses serve as a supplementary safeguard.
