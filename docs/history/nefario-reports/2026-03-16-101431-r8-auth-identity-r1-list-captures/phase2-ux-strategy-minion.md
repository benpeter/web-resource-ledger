## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. The POST /v1/captures Response: From Warning to Welcome

The current `note` field reads: *"No list endpoint is available. Store the capture ID -- it is the only way to access this capture."*

This is an anti-pattern I flagged during roadmap prioritization: if you have to warn users about a design limitation in every response, that limitation is the product's most urgent problem. Once the list endpoint ships, the limitation vanishes. The `note` field should reflect the new reality.

**Recommendation: Replace the warning with a positive capability statement.**

The new `note` value should be:

```
"Use GET /v1/captures to list and search your captures."
```

Rationale for this specific phrasing:

- **It tells the user what they CAN do, not what they should fear.** The old message was a constraint disguised as advice ("Store the capture ID" is really "or you're screwed"). The new message is an affordance -- it tells users about a capability they might not have discovered yet.
- **It's actionable.** The user can immediately act on this information. The old message required the user to invent their own storage mechanism.
- **It matches the real-world mental model.** Nobody expects "capture a webpage" to be a one-shot, no-recovery operation. The old note was fighting against the user's natural expectation. The new note confirms what users already assume should be true.
- **It's brief.** Following Krug: get rid of half the words, then get rid of half of what's left.

**Alternative considered and rejected: remove the `note` field entirely.** This would be the cleanest API response, but `note` serves a useful progressive disclosure function -- it points users to a related capability without requiring them to read the full docs. Keep it, but make it helpful instead of alarming.

**Schema change:** Update the `CaptureAccepted` schema description for `note` from "Advisory message reminding callers to store the capture ID" to "Advisory message about related API capabilities." The field is advisory metadata -- its purpose is to reduce the distance between "I just created a capture" and "I know what I can do next." That purpose stays the same; only the content changes.

**Breaking change risk: none.** The `note` field is typed as `string` with no enum constraint. Clients that parse it programmatically are already fragile (it's a human-readable advisory). Clients that display it benefit from the improvement. Clients that ignore it are unaffected.

#### 2. README Language: From Warnings to Capabilities

The README currently has three "lost ID" touchpoints that need to change:

**Line 44 (example response):** The JSON example shows the old `note` value. Update to the new value.

**Line 48 ("Store the capture ID. There is no listing endpoint to recover it."):** This entire sentence should be replaced. The new language should describe the workflow positively:

> Your captures are always accessible. Use `GET /v1/captures` to list them, or save the capture ID for direct access.

This reframes the mental model from "careful -- don't lose this" to "here are two ways to get your data." It reduces cognitive load because users don't have to remember a warning. It matches Nielsen's heuristic of user control and freedom: users have multiple paths, not a single fragile one.

**Line 74 ("The raw capture ID grants full access to all artifacts -- treat it as a secret."):** This statement remains true and should stay, but its context changes. Currently it sits adjacent to "there is no listing endpoint" which creates a fear-based framing: "this is the only key to your data AND it's a security credential." With the list endpoint, the security framing stands on its own merits without the loss-anxiety overlay.

I recommend keeping this security advisory but softening the isolation. Currently it reads as "this is your only access path AND it's sensitive." After the list endpoint, it should read as "this is sensitive" without the implication that losing it means losing the data:

> The capture ID grants full access to all artifacts without authentication -- treat it as a secret. Anyone with the ID can view the capture.

The word "raw" is jargon that adds nothing. "Without authentication" makes the security property explicit rather than leaving it to inference. "Anyone with the ID can view the capture" explains the consequence in plain language.

#### 3. The Dual-Access Mental Model: ID-as-Secret vs. List-as-Index

This is the most important question in the planning set, and the answer is: **the dual model is not inherently confusing, but it will become confusing if it's not explicitly framed.**

**The current mental model (pre-list):**

```
Capture ID = the only key to your data (access + identity, one object)
```

Simple. One concept. Users understand it because it's the only option.

**The post-list mental model has two access patterns:**

```
List endpoint = authenticated index of your captures (requires API key)
Capture ID    = direct link to a specific capture (no auth needed)
```

This is analogous to a familiar real-world pattern: **a filing cabinet vs. a document link.** You browse the filing cabinet (list endpoint, requires your key) to find things. You share a specific document link (capture ID URL) with anyone who needs to see it. These are complementary, not conflicting.

**Where confusion arises without reframing:**

The risk is that users think "list endpoint means capture IDs don't matter anymore" or conversely "if the ID is a secret, why can I also find it in a list?" The documentation needs to make the two-role distinction explicit:

1. **The list endpoint is for finding your captures.** It requires your API key and shows only your captures.
2. **The capture ID is for sharing captures.** It works without authentication, so you can give it to anyone who needs to verify the evidence.

This maps to two distinct JTBD:

- **Finding job:** "When I need to find a capture I made, I want to browse my captures by date, so I don't have to remember an ID."
- **Sharing job:** "When I need to share evidence with a third party, I want to give them a link that works without credentials, so they can verify independently."

**Reframing recommendation for the README:**

Add a brief conceptual section (2-3 sentences) near the usage examples that frames the two access patterns:

> **Finding captures:** `GET /v1/captures` lists your captures (requires your API key). Use it to browse, search, and recover capture IDs.
>
> **Sharing captures:** The capture ID in any URL (status, retrieval, verification) works without authentication. Share verification URLs freely -- they are safe for public use. Keep capture IDs private -- they grant access to all artifacts.

This is progressive disclosure in documentation form: the user learns about both access patterns in one glance, with a clear mental model for when to use each.

**What NOT to do:** Don't create a "Security Model" section or an "Access Patterns" explainer page. That signals complexity. Two sentences in the right place are worth more than a dedicated section that users skip.

#### 4. The `note` Field in the OpenAPI Spec: Schema and Example Updates

The `CaptureAccepted` schema example in `openapi.yaml` (line 580) hardcodes the old warning. This needs to update alongside the code change. The `CaptureRecord` description (line 188-193) says "there is no listing endpoint to recover it." This needs to update as well.

**Specific changes needed in `openapi.yaml`:**

1. `CaptureAccepted.properties.note.description`: Change from "Advisory message reminding callers to store the capture ID" to "Advisory message about related API capabilities."
2. `CaptureAccepted` example `accepted.value.note`: Change to the new note text.
3. `CaptureRecord` description: Remove "Store it; there is no listing endpoint to recover it." Replace with language acknowledging the list endpoint.
4. `CaptureId` description: Currently says "Also serves as the access secret -- store it." This can be simplified to "Also serves as the access secret for unauthenticated access to individual captures."

#### 5. Downstream Documentation Changes: Verification Page Context

The HTML verification page (`verify-page.js`) likely contains or could contain references to the capture-ID-as-only-access pattern. Review for any "store this ID" language that needs updating. This is low-priority -- the verification page is a sharing context, so the "ID is the secret" framing is already correct there.

### Proposed Tasks

#### Task UX-1: Update POST /v1/captures response note

**What:** Change the `note` field value in `handleCreateCapture` (src/index.js line 139) from the lost-ID warning to `"Use GET /v1/captures to list and search your captures."`

**Deliverables:** One-line code change.

**Dependencies:** Must ship simultaneously with the list endpoint. If the note references an endpoint that doesn't exist, it's worse than the current warning. This should be the last change merged, or part of the same PR as the list endpoint.

**Why this matters:** The response body is the first thing every API consumer sees after their first successful capture. It sets the tone for the entire product experience. Moving from fear ("store this or lose it") to capability ("here's what you can do next") is disproportionately impactful relative to the effort.

#### Task UX-2: Update README usage documentation

**What:** Rewrite lines 44, 48, and 74 of README.md to reflect the new dual-access mental model. Add 2-3 sentence conceptual framing of "finding captures" vs. "sharing captures."

**Deliverables:** README text changes (no structural changes).

**Dependencies:** Same as UX-1 -- must ship with or after the list endpoint.

**Why this matters:** The README is the product's front door. Every "lost ID" warning currently visible is an admission that the product has a known design flaw. Removing the warnings and replacing them with capability descriptions is a Kano must-be fix -- the presence of warnings was actively damaging satisfaction.

#### Task UX-3: Update OpenAPI spec descriptions and examples

**What:** Update `CaptureAccepted`, `CaptureRecord`, and `CaptureId` schema descriptions and examples to reflect the list endpoint's existence. Remove all "no listing endpoint" language.

**Deliverables:** openapi.yaml changes.

**Dependencies:** Same as UX-1 -- ship with the list endpoint.

**Why this matters:** The OpenAPI spec is the contract. SDK generators, documentation tools, and API explorers all consume it. Stale warnings in the spec will propagate into generated documentation and confuse users who discover the list endpoint through the spec but see warnings saying it doesn't exist.

#### Task UX-4: Validate the dual-access mental model with first real list-endpoint usage

**What:** After the list endpoint ships, the next time someone (even the operator) uses it in a real workflow, friction-log the experience. Specifically: Was the relationship between "list to find" and "ID to share" intuitive? Did anyone try to share a list-endpoint URL instead of a capture-ID URL? Did anyone assume the list endpoint made capture IDs unnecessary?

**Deliverables:** Friction log entry (informal, in evolution docs).

**Dependencies:** List endpoint must be live.

**Why this matters:** The dual-access model is my best analysis of how users will understand the system, but it's untested. Real usage will surface whether the mental model holds or breaks. This is the feedback loop that Risk 5 from the roadmap prioritization flagged -- without it, we're designing by theory alone.

### Risks and Concerns

**Risk 1: Premature note change creates a worse experience.** If the `note` field references `GET /v1/captures` before that endpoint exists, a user who follows the instruction gets a 404. This is strictly worse than the current warning. The note change MUST be atomic with the endpoint deployment. In PR/merge strategy terms: the note change should be in the same PR as the list endpoint, or gated behind a feature check.

**Risk 2: The "two access patterns" framing gets over-explained.** There's a real temptation to write a long explanation of why capture IDs are secrets while the list endpoint uses API keys. Resist this. Two sentences in the README. The OpenAPI descriptions. Done. If the model requires a paragraph to explain, the model is too complex -- but in this case, it maps to a real-world analogy (filing cabinet vs. document link) that people already understand. Trust the analogy; don't over-explain it.

**Risk 3: The CaptureRecord description change in OpenAPI could be read as a security relaxation.** The current description says "Store it; there is no listing endpoint to recover it" which implicitly says "the ID is the ONLY way in." Removing this could be misread as "we relaxed security." The replacement language should be explicit that the list endpoint is scoped to the authenticated tenant, not that captures are now publicly discoverable.

**Risk 4: Capture-ID-as-secret pattern may need re-evaluation with listing.** The list endpoint returns capture IDs in its response. This means anyone with API key access can obtain all capture IDs and therefore access all captures. In single-tenant this is fine (the operator already has the API key). In multi-tenant, this is the intended behavior (your key shows your captures). But the list endpoint subtly changes the capture ID from "a secret you were given at creation time" to "a value retrievable from an authenticated index." The security properties are identical, but the user perception shifts. The README should not frame capture IDs as "secrets you must carefully guard" when they're also "values you can look up any time." Use "access credential" or "access link" language instead.

### Additional Agents Needed

**user-docs-minion** -- The README changes in Task UX-2 should be reviewed for clarity and consistency with the rest of the README's tone. The current README is well-written; the new language should match its style (direct, technical, no marketing fluff).

**security-minion** -- Risk 4 (the perception shift in capture-ID-as-secret when IDs are also listable) should be reviewed from a security perspective. The actual security properties don't change, but the documentation language should be validated to ensure it doesn't create false expectations about ID confidentiality.
