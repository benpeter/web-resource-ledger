# WRL API Deprecation Policy

## Purpose

This document describes how the Web Resource Ledger API handles versioning, breaking changes,
and the deprecation lifecycle. WRL follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## Versioning Scheme

The current API version is returned in the `WRL-API-Version` response header on every response.

**Major versions** (e.g., `/v1/` → `/v2/`) are introduced when breaking changes cannot be
avoided. Old major versions are maintained in parallel for the duration of their sunset period.

**Minor and patch versions** are backward-compatible. A new minor or patch version will never
require changes to existing integrations.

## What Counts as a Breaking Change

The following changes require a new major version and are subject to the full deprecation lifecycle:

- Removing an endpoint
- Removing a field from a response
- Changing the type of a field (e.g., string → integer)
- Changing the meaning or semantics of an existing status code on an endpoint
- Renaming a field
- Making an optional request parameter required
- Changing the structure of an error response in a way that breaks existing parsers

## What Is NOT a Breaking Change

The following changes may be shipped in any release without a deprecation notice:

- Adding a new endpoint
- Adding a new optional request parameter
- Adding a new field to a response
- Adding a new optional request or response header
- Fixing a bug where the actual behavior did not match the documented spec
- Performance improvements that do not change observable API behavior
- Adding new error codes for inputs that were previously unvalidated

Integrations should be written to tolerate unknown fields in responses and unknown header values.

## Deprecation Lifecycle

When a breaking change is necessary, the old behavior follows this lifecycle:

1. **Announcement** — a `Deprecated` entry is added to CHANGELOG.md and `deprecated: true` is
   set on the affected operation in openapi.yaml.

2. **Deprecation signal** — the deprecated endpoint begins returning two headers:
   - `Deprecation: @<unix-timestamp>` per [RFC 9745](https://www.rfc-editor.org/rfc/rfc9745)
     (the `@timestamp` format denotes the date the deprecation took effect)
   - `Sunset: <HTTP-date>` per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)
     (the date on which the endpoint will stop functioning)
   - `Link: <https://docs.webresourceledger.com/migration/...>; rel="deprecation"`
     pointing to the migration guide for the affected endpoint

3. **Migration period** — the deprecated endpoint continues to function normally until the
   Sunset date. The minimum migration period is **6 months** from the Deprecation effective date
   to the Sunset date.

4. **Retirement** — on or after the Sunset date, the endpoint is removed or returns `410 Gone`.

### Example headers during deprecation

```
Deprecation: @1769817600
Sunset: Sat, 30 Sep 2028 23:59:59 GMT
Link: <https://docs.webresourceledger.com/migration/v1-to-v2>; rel="deprecation"
```

## Emergency Deprecation

In cases involving a confirmed security vulnerability, the standard 6-month minimum period
may be shortened. The minimum notice period for an emergency deprecation is **30 days**.
Emergency deprecations are announced in CHANGELOG.md with an explicit `[SECURITY]` marker
and will include an explanation of the vulnerability class.

## Communication Channels

Deprecation notices are communicated through the following channels:

- **Response headers** — `Deprecation` and `Sunset` headers on every response from the
  affected endpoint (machine-readable; suitable for automated monitoring)
- **CHANGELOG.md** — `Deprecated` section entry with the Sunset date and link to migration guide
- **openapi.yaml** — `deprecated: true` on affected operations
- **Migration guides** — published at `https://docs.webresourceledger.com/migration/`

## What This Policy Does NOT Promise

- **Individual notification** to API key holders. WRL does not send email or other direct
  outreach when an endpoint is deprecated. Monitor the `Deprecation` and `Sunset` response
  headers or subscribe to the CHANGELOG to stay informed.
- **Indefinite support** for deprecated endpoints. Once the Sunset date passes, the endpoint
  will be removed regardless of whether any given integration has migrated.

## Standards

The `Deprecation` header follows [RFC 9745](https://www.rfc-editor.org/rfc/rfc9745) —
*The Deprecation HTTP Header Field*.

The `Sunset` header follows [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) —
*The Sunset HTTP Header Field*.
