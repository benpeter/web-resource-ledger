R41: FRE 902(13) certification document

Every WRL capture can produce a downloadable FRE 902(13) certification document - a structured, human-readable PDF that attests to the automated capture process, integrity hashes, and timestamp evidence. This document is designed to satisfy Federal Rules of Evidence 902(13) self-authentication requirements, eliminating the need for live testimony to authenticate web capture evidence in US court proceedings.

Success criteria:
- API endpoint: GET /v1/captures/{id}/certificate returns a PDF certification document
- Web UI: "Download Certificate" button on capture detail view
- Document includes capture URL, date/time, SHA-256 hash, Ed25519 signature, RFC 3161 timestamp details, eIDAS details, automated capture process description, operator identity
- Document is deterministic: same captureId always produces the same PDF
- Document itself is signed (Ed25519 signature embedded or detached)
- PDF generation uses a lightweight library (pdf-lib or similar)
- Works for any existing capture (generates on demand from stored capture metadata)

Scope:
- In: PDF generation endpoint, certification document template, Ed25519 signing of the document, web UI download button, API documentation
- Out: Notarization integration, attorney review of language, batch certificate generation, customizable templates per tenant

Constraints:
- Depends on R30 (D1 for capture metadata)
- Depends on R17 (web UI for download button)
- PDF must be self-contained (no external resource loading)
- Legal disclaimer required
- Language must be precise but accessible
