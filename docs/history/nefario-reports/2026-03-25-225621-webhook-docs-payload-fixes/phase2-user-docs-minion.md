## Domain Plan Contribution: user-docs-minion

### Recommendations

**Q1: Should `capture.quarantined` get its own payload example section?**

Yes -- give it a full payload example section at the same level as `capture.complete` and `capture.failed`. Three reasons:

1. **Consistency.** Every other event type in VALID_EVENTS has its own `### heading` with a JSON example. Omitting one breaks the user's mental model ("I see complete and failed documented, so those must be all the events"). Users who subscribe to it will have no reference for what to expect.
2. **The payload has unique fields.** `quarantineReason` and `quarantinedAt` are specific to this event type and not inferable from the other examples. Users need to see them to build handlers.
3. **Discoverability.** A user scanning the "Event types" section should see all subscribable events at a glance. A buried mention forces them to guess or experiment.

Keep the section brief -- a short description (one sentence on what quarantine means in WRL context), the JSON example, and a field table if needed. No more verbose than the `capture.failed` section.

**Q2: How to present conditional `changeDetection` without cluttering the primary example?**

Use a two-example approach within the `capture.complete` section:

1. **Primary example stays clean.** Show the base `capture.complete` payload without `changeDetection` -- this is the common case for first captures and single-shot usage.
2. **Second example below a clear subheading.** Add a `#### Change detection (conditional)` subheading with a brief explanation ("When a previous capture exists for the same URL, the payload includes a `changeDetection` object") followed by the full example including the nested object.

This is progressive disclosure done right: the primary example stays scannable, and users who need change detection find it immediately below without navigating away. Do NOT use an accordion/collapsible here -- the field is important enough to be visible on scroll, and collapsibles in code examples frustrate copy-paste workflows.

**Q3: Accurate label for the retry schedule?**

Call it a **"fixed retry schedule"** -- because that is what it is. The delays are predetermined constants (60s, 300s, 900s), not computed from a formula. "Exponential backoff" is factually wrong (exponential would be 60, 120, 240 or similar doubling pattern). "Increasing delays" is vague. "Fixed schedule" is precise and matches the implementation (`const schedule = [60, 300, 900]`).

Recommended phrasing: "WRL retries with a fixed schedule of increasing delays" -- this communicates both that the delays grow AND that they are not dynamically computed. The table already shows the exact values, so the label just needs to not contradict them.

### Proposed Tasks

**Task 1: Fix payload field names in `capture.complete` example** (Priority: critical)
- Replace `data.id` with `data.captureId` (line 66)
- Remove `data.createdAt` (line 69) -- not sent by code
- Remove `renderQuality` (line 71) -- not sent by code
- Replace `verifyUrl` with `verificationUrl` (line 77)
- Remove `artifacts` block (lines 72-76) -- not sent by code; artifact URLs are not in the webhook payload

**Task 2: Fix payload field names in `capture.failed` example** (Priority: critical)
- Replace `data.id` with `data.captureId` (line 92)
- Remove `data.createdAt` (line 95) -- not sent by code
- Add `verificationUrl` field -- code sends it for all event types (line 110 of webhook-dispatch.js) but docs omit it from the failed example

**Task 3: Add `capture.quarantined` event type section** (Priority: high)
- New `### capture.quarantined` heading after `capture.failed`
- One-sentence description of when it fires
- JSON payload example with `quarantineReason` and `quarantinedAt` fields
- Include in the registration example's events array or add a note that it can be subscribed to

**Task 4: Add `changeDetection` conditional field documentation** (Priority: high)
- Add `#### Change detection (conditional)` subheading within `capture.complete`
- Brief explanation of when it appears (previous capture exists for same URL)
- Full JSON example showing the `changeDetection` object with `changed`, `previousCaptureId`, `diffUrl`, and `summary` sub-fields

**Task 5: Fix retry behavior label** (Priority: medium)
- Replace "exponential backoff" (line 221) with "fixed retry schedule"
- Phrasing: "WRL retries with a fixed schedule of increasing delays:"
- Table content is already correct, only the label needs updating

**Task 6: Add `updatedAt` to list response example** (Priority: medium)
- Add `"updatedAt": "2026-03-22T12:00:00.000Z"` to the list response JSON example (around line 275)
- The code explicitly includes `updatedAt` in the list mapping (webhooks.js line 203)

**Task 7: Update registration example to include `capture.quarantined`** (Priority: low)
- Add `capture.quarantined` to the valid event types mentioned in constraints or a note
- Update the "Event types" intro text if it currently implies only two types exist

### Risks and Concerns

1. **Artifacts block removal may confuse existing users.** The current docs show an `artifacts` object with screenshot/html/headers URLs. The code does NOT send this in webhooks. Removing it is correct but may surprise users who built handlers expecting it. Consider adding a brief note: "Artifact URLs are not included in webhook payloads. Use the capture ID to retrieve artifacts via `GET /v1/captures/{captureId}`." This turns a silent removal into actionable guidance.

2. **`capture.quarantined` may be an internal/undocumented-by-design event.** It is in VALID_EVENTS and has a code path, but it was not documented. Confirm with the project owner whether this event type is intended for public subscribers or is reserved for future use. If reserved, it should still be documented but marked as such (e.g., "This event type is accepted but may not fire in all configurations").

3. **`changeDetection.diffUrl` endpoint may not exist yet.** The payload construction builds a URL like `/v1/captures/{prev}/diff/{current}` -- verify this endpoint actually exists and is documented before showing it in the example. If it does not exist, either omit `diffUrl` from the example or add a note that it requires diff functionality to be enabled.

4. **Verification examples need updating across both event types.** Since `verificationUrl` is sent on ALL event types (complete, failed, quarantined), every payload example must include it. The current failed example omits it entirely, which would lead users to believe failed captures cannot be verified.

### Additional Agents Needed

None. This is a documentation-only change to `site/content/webhooks.md`. The fixes are mechanical (align docs to code) and do not require code changes, API review, or design input. The implementing agent just needs to read the code carefully and update the markdown examples to match.
