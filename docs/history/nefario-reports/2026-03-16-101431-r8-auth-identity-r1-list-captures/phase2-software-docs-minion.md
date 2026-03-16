## Domain Plan Contribution: software-docs-minion

### Recommendations

#### 1. Complete inventory of "lost-ID" language to update

I found **8 distinct locations** across 4 files that contain lost-ID or no-listing-endpoint language. All must be updated atomically in the same PR that ships the list endpoint. They fall into two categories:

**Category A -- Must be removed or rewritten (lost-ID is no longer true):**

1. **`openapi.yaml` line 192-193** -- `CaptureRecord.description`: "Store it; there is no listing endpoint to recover it." Remove this sentence entirely. The rest of the description about capture-ID-as-access-secret for the individual GET endpoint remains accurate (the per-capture endpoint still uses ID-as-secret).

2. **`openapi.yaml` line 580** -- POST `/v1/captures` 202 response example `note` value: `"No list endpoint is available. Store the capture ID -- it is the only way to access this capture."` This must change (see recommendation #2 below).

3. **`README.md` line 44** -- The example JSON response showing the `note` field with the same lost-ID text. Must match whatever the new `note` value becomes.

4. **`README.md` line 48** -- Prose sentence: "Store the capture ID. There is no listing endpoint to recover it." Remove entirely or replace with a pointer to the list endpoint.

5. **`docs/MVP.md` line 48** -- "There is no list endpoint in the MVP. If the caller loses the capture ID, the capture is permanently inaccessible." This is historical documentation of the MVP scope. It should be updated with a note that R1 resolved this limitation, not deleted (MVP.md documents the original scope decisions, so a brief annotation is appropriate).

6. **`docs/MVP.md` line 71** -- "List/search captures" row in the "What's Out" table, marked as "No GET /captures endpoint. First addition post-MVP." Same treatment: annotate as resolved, don't delete.

7. **`src/index.js` line 139** -- The runtime `note` string literal. This is the source of truth for what the API actually returns. Must change to match the new spec.

8. **`docs/backlog.md` line 123** -- "Capture ID recovery | Solved by R1; remove after R1 ships". This is already forward-looking. When R1 ships, remove this row.

**Category B -- "Access secret" language that remains valid:**

These references describe the per-capture-ID-as-secret pattern for individual capture access and do NOT need updating. The list endpoint uses Bearer auth, but individual capture retrieval (`GET /v1/captures/{captureId}`, `/status`, `/artifacts/*`) still uses ID-as-secret:

- `openapi.yaml` line 60 -- `CaptureId.description`: "Also serves as the access secret -- store it." This remains accurate. The ID is still a secret for per-capture access. However, consider softening "store it" since recovery is now possible via the list endpoint. Recommended change: "Also serves as the access secret for per-capture access." Drop the imperative "store it."
- `openapi.yaml` lines 599-600, 662-663, 738-739 -- endpoint descriptions saying "capture ID acts as the access secret." These remain accurate and should not change.
- `README.md` line 56 -- "No auth required -- the capture ID acts as the access secret." Remains accurate.
- `README.md` line 74 -- "The raw capture ID grants full access to all artifacts -- treat it as a secret." Remains accurate.

#### 2. The `CaptureAccepted.note` field: change value, keep field

The `note` field itself should remain in the schema. It is typed as `type: string` with a generic description ("Advisory message reminding callers to store the capture ID"), which is flexible enough to accommodate any advisory text. However:

- **Change the schema description** from "Advisory message reminding callers to store the capture ID" to "Advisory message for API callers." The current description is too specific to the lost-ID era.
- **Change the example value** to something that remains useful without being misleading. Recommended: `"Store the capture ID for direct access. You can also retrieve your captures via GET /v1/captures."` This preserves the advisory nature (IDs are still secrets worth storing) while informing callers about the list endpoint.
- **Change the runtime value** in `src/index.js` to match the new example.
- **Do NOT remove the field**. Removing it is a breaking API change (clients may parse it). The field is `required` in the schema. Deprecating and removing it later requires a deprecation cycle. For now, update the content.

#### 3. New OpenAPI spec additions for `GET /v1/captures`

The new endpoint needs these spec components:

**New schemas:**

- `CaptureListItem` -- A lightweight representation for list results. Should NOT reuse `CaptureRecord` directly because list items likely omit heavy fields (artifacts, wacz, verifyUrl) for performance. Fields: `id`, `status` (enum: pending, complete, failed -- unlike CaptureRecord which is always "complete"), `url`, `createdAt`, `completedAt` (nullable, absent for pending/failed). This keeps list responses lean while individual GET returns the full record.

- `PaginationCursor` -- Object with `cursor` (nullable string, null when no more pages) and `hasMore` (boolean). Keep it storage-backend-agnostic per issue #31's constraint.

- `CaptureListResponse` -- Envelope: `{ data: CaptureListItem[], pagination: PaginationCursor }`. Establishes the envelope pattern for future collection endpoints.

**New query parameters (defined in `components/parameters` for reuse):**

- `status` -- query param, optional, enum: [pending, complete, failed]. Filters by capture status.
- `cursor` -- query param, optional, string. Opaque pagination cursor from a previous response.
- `limit` -- query param, optional, integer, minimum 1, maximum 100, default 20. Page size.

**New path entry:**

`GET /v1/captures` with `operationId: listCaptures`, `security: [bearerAuth: []]`, the three query parameters, 200 response with `CaptureListResponse`, plus 401, 429 error responses. The 200 response should include examples for: first page with more results, last page (cursor null, hasMore false), empty result set, and filtered by status.

**Auth note:** This endpoint requires Bearer auth (`bearerAuth`), same as POST. This is unlike the per-capture GET endpoints which use ID-as-secret. The spec's `security` section for this operation must explicitly require `bearerAuth`.

#### 4. OpenAPI spec `info.version` consideration

Adding a new endpoint is a minor version bump under semver. The current version is `0.1.0`. Recommend bumping to `0.2.0` to signal the new capability. Pre-1.0, minor bumps can include breaking changes, but this is purely additive.

#### 5. README updates beyond lost-ID removal

- **Usage section**: Add a "Step 1b: List your captures" example between the current Step 1 and Step 2, showing the `GET /v1/captures` curl command with Bearer auth and a sample paginated response.
- **API Surface table in MVP.md**: Consider adding a note that the list endpoint was added post-MVP in R1.

### Proposed Tasks

1. **[spec] Add `GET /v1/captures` path and supporting schemas to `openapi.yaml`**
   - Add `CaptureListItem`, `PaginationCursor`, `CaptureListResponse` schemas
   - Add `status`, `cursor`, `limit` query parameter definitions
   - Add the path with operationId `listCaptures`, security, parameters, responses, examples
   - Bump `info.version` to `0.2.0`
   - Estimated: this is the bulk of the spec work

2. **[spec] Update lost-ID language in `openapi.yaml`**
   - Rewrite `CaptureRecord.description` (remove "no listing endpoint" sentence)
   - Update `CaptureAccepted.note` schema description
   - Update POST 202 example `note` value
   - Soften `CaptureId.description` (remove imperative "store it")

3. **[code] Update runtime `note` value in `src/index.js`**
   - Change the hardcoded note string to match the new spec example
   - This is a one-line change but must be coordinated with the spec update

4. **[docs] Update `README.md` lost-ID language and add list endpoint usage**
   - Remove "Store the capture ID" warning prose
   - Update the 202 response example JSON to show the new note value
   - Add a usage example for `GET /v1/captures` with curl + sample response

5. **[docs] Annotate `docs/MVP.md` to reflect R1 resolution**
   - Add inline notes to the "Capture ID loss" paragraph and "What's Out" table indicating R1 resolved these limitations
   - Do not delete the original text (it documents the MVP scope decision)

6. **[docs] Clean up `docs/backlog.md`**
   - Remove the "Capture ID recovery" row (solved by R1)
   - Mark R1 as complete/shipped

### Risks and Concerns

1. **`CaptureListItem` vs `CaptureRecord` schema divergence**: If the list endpoint returns full `CaptureRecord` objects, the schema is simpler but responses are heavy (artifact URLs, wacz metadata for every item in a 20-item page). If it returns a lightweight `CaptureListItem`, there are two representations of a capture. I recommend the lightweight approach (list returns summary, individual GET returns full record) -- this is standard REST practice and keeps list responses fast. But the team must decide explicitly. This belongs in an ADR or at minimum in the evolution log `decisions.md`.

2. **`note` field backward compatibility**: Any client parsing the `note` field for the exact old string will break. This is unlikely (the field is advisory, not machine-readable), but worth noting. The field staying `required` and remaining a string is sufficient for backward compatibility.

3. **Envelope pattern lock-in**: The `{ data, pagination }` envelope established here becomes the contract for all future collection endpoints. Get it right now. Issue #31 explicitly calls this out. Consider whether the envelope should also include a `total` count field (even if null/absent initially) to avoid a breaking change later. KV `list()` doesn't provide total counts cheaply, so I'd recommend omitting `total` and letting `hasMore` + cursor suffice. But document the decision.

4. **Spec validation in CI**: The OpenAPI spec should be validated in CI after these changes. If there's no existing validation step, this is a good time to add one (a single `npx @redocly/cli lint openapi.yaml` step).

### Additional Agents Needed

- **api-design-minion**: Should validate the `CaptureListItem` schema design, the envelope pattern, and the pagination contract before spec work begins. The choice between lightweight list items vs full records, and whether to include `total` in the envelope, are API design decisions that should be settled before documentation.
- **backend-minion** (or equivalent implementation agent): Must coordinate on the exact `CaptureListItem` fields since the spec must match what KV list operations can efficiently populate. The spec should not promise fields the backend cannot deliver in <300ms.
