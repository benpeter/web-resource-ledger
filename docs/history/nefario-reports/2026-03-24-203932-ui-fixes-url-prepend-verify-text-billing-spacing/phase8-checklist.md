# Phase 8a: Documentation Checklist

## Items

1. [SHOULD] [user-docs] Release notes entry for three UI bug fixes
   - URL auto-prepend: capture form now accepts bare hostnames
   - Verify page: "Art." corrected to "Article"
   - Billing page: spacing between numbers and labels

2. [COULD] [software-docs] Scan for stale references to URL validation behavior
   - The error message changed from "Enter a valid http:// or https:// URL" to "Enter a valid URL (e.g. example.com or https://example.com)"
   - No known docs reference this error message

## Assessment

0 MUST items. 2 items total (1 SHOULD, 1 COULD). These are small bug fixes with no API surface changes. No documentation is stale — the error message is internal to the UI and not referenced in any documentation.
