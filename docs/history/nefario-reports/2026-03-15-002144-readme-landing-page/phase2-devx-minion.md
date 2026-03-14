# Domain Plan Contribution: devx-minion

## Recommendations

### (a) Numbered walkthrough, not separate disconnected blocks

Present the full capture-poll-retrieve-verify flow as a **single numbered walkthrough** with sequential code blocks. This is the right call for three reasons:

1. **WRL has an async API.** The capture endpoint returns 202, not 200. A developer who copies only the POST block will get a response containing an ID and a status URL -- and then have no idea what to do next. Disconnected blocks create a "now what?" gap that the numbered walkthrough eliminates.

2. **The flow is short.** Four steps (capture, poll, retrieve, verify) is within the threshold where a numbered walkthrough stays scannable. If it were 8+ steps, I would recommend splitting into "Quick Start" and "Full Workflow" sections. At four steps, a single walkthrough is right.

3. **The polling step needs narrative, not just curl.** Between step 1 (POST) and step 3 (GET capture), the developer needs to understand "poll until status is complete." This requires a brief sentence between the curl blocks -- something a numbered walkthrough supports naturally but separate code blocks do not.

**Specific structure I recommend:**

```
### Usage

> Requires a running WRL instance. See [Setup](#setup) below.

#### 1. Capture a page

\`\`\`bash
curl -X POST https://wrl.example.com/v1/captures \
  -H "Authorization: Bearer $WRL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
\`\`\`

Response (202 Accepted):
\`\`\`json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "statusUrl": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status",
  "note": "Store the capture ID -- it is the only way to access this capture."
}
\`\`\`

#### 2. Poll for completion

\`\`\`bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/status
\`\`\`

No auth required -- the capture ID is the access secret. Poll until `status` is `"complete"`.

#### 3. Retrieve the capture

\`\`\`bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
\`\`\`

Returns metadata, artifact URLs (screenshot, HTML, headers), and WACZ bundle info.

#### 4. Verify the bundle

\`\`\`bash
curl https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 \
  | jq '.verifyUrl'
# Then open the verify URL in a browser, or:
curl https://wrl.example.com/v1/verify/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
\`\`\`
```

Key design choices in this structure:

- **Show the response for step 1 only.** This is the critical response -- it contains the ID the developer needs for everything else. Steps 2-4 describe what comes back in prose rather than full JSON blocks, keeping the walkthrough compact. The full response shapes are in `openapi.yaml` for anyone who needs them.
- **Use H4 (`####`) for steps.** This keeps them out of the GitHub-rendered right-side table of contents (which only shows H2 and H3 by default), avoiding clutter while still being scannable within the section.
- **Include `jq` in step 4.** This signals that responses are machine-parseable JSON -- a subtle but important signal for scripting-oriented developers.
- **The "no auth required" note lives at step 2, right where the developer notices the missing `-H "Authorization"` flag.** This is the moment of maximum relevance.

### (b) Use `$WRL_API_KEY` environment variable, not a literal placeholder

Use `$WRL_API_KEY` for the following reasons:

1. **Copy-paste workflow.** A developer who sets `export WRL_API_KEY=their-key` can then copy-paste every curl command verbatim. A literal placeholder like `your-api-key-here` requires manual editing of every command, which is a friction point and an error source.

2. **Convention.** The `$VARIABLE_NAME` pattern is the established convention in Stripe, Twilio, GitHub, and every other API README I've reviewed. Developers recognize it instantly.

3. **Scriptability signal.** Using an env var subtly communicates that WRL's API is designed for automation, not just interactive use. This matters for the target audience (compliance, legal-tech, journalism tooling).

4. **Naming: `WRL_API_KEY`, not `CAPTURE_API_KEY`.** The internal env var in `.dev.vars` is `CAPTURE_API_KEY` (the server-side name). But the README-facing examples should use the user-facing name `WRL_API_KEY`. Reasons: (a) it is shorter, (b) it follows the `{PRODUCT}_{CREDENTIAL_TYPE}` convention, (c) `CAPTURE_API_KEY` implies it only works for captures, but in the future this key may govern more operations. Add a note in the setup section: *"In examples, this is referenced as `$WRL_API_KEY`."*

**Important: show the export once, early.** Right before the walkthrough or in the "note" line at the top:

```bash
export WRL_API_KEY="your-api-key"
```

This teaches the pattern and makes every subsequent example copy-paste-ready.

### (c) Explicitly highlight the auth asymmetry -- it is a feature, not an implementation detail

The capture ID as access secret is a deliberate design decision with real user-facing implications. Keeping it implicit would be a mistake for three reasons:

1. **Security awareness.** If a developer shares a capture ID casually (e.g., in a Slack message, log, or bug report), anyone with that ID can access the capture. They need to understand this.

2. **The API response already tells them.** The `note` field in the 202 response literally says "Store the capture ID -- it is the only way to access this capture." The README should reinforce this, not contradict the API's own documentation.

3. **It explains why GET endpoints have no `-H "Authorization"` flag.** Without the explanation, a developer might assume the examples are incomplete or insecure.

**How to highlight it -- one sentence, not a section.** This does not need its own heading or a security callout box. A single sentence at step 2 of the walkthrough is sufficient:

> No auth required -- the capture ID is the access secret. Poll until `status` is `"complete"`.

And a one-line note after the walkthrough:

> **Note:** There is no list endpoint. The capture ID is the only way to access a capture -- treat it like a credential.

This is direct, non-alarmist, and placed where the developer will actually read it (in the context of using the API, not in a security preamble they'll skip).

### (d) Happy path only in the Usage section. One error note, no error blocks.

Do **not** include error response examples in the Usage section. Rationale:

1. **The Usage section's job is to build confidence, not anxiety.** Error examples before a developer has successfully made their first call create cognitive overhead. The question they're answering is "can I use this?" -- not "what happens when it breaks?"

2. **The openapi.yaml has comprehensive error examples.** WRL's spec includes detailed error responses for 400, 401, 415, 422, 429, and 503 -- with multiple examples per status code. Duplicating these in the README adds maintenance burden with no benefit.

3. **One exception: mention the 401 inline.** If the developer forgets the Authorization header, they will hit a 401 immediately. Rather than showing the full error response, add a brief note:

> Missing or invalid `Authorization` header returns `401 Unauthorized`.

This is enough for a developer to self-diagnose without cluttering the walkthrough.

**Point to the spec for the rest:**

> See [`openapi.yaml`](openapi.yaml) for all response codes and error formats.

This single line handles every error case without bloating the README.

## Proposed Tasks

### Task 1: Draft the Usage walkthrough section

Write the four-step numbered walkthrough following the structure in recommendation (a). Use example values from `openapi.yaml` (specifically the `cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6` capture ID and `wrl.example.com` host, which are already used consistently across the spec). Include the `export WRL_API_KEY` preamble.

### Task 2: Document CAPTURE_API_KEY setup at parity with SIGNING_KEY

The current README documents SIGNING_KEY thoroughly (generate, set production secret, set local dev secret, security note). CAPTURE_API_KEY gets zero mention in README.md (only in CONTRIBUTING.md). Add a parallel section:

- How to generate/choose a key (it's a static bearer token, not a keypair -- simpler than signing key)
- `wrangler secret put CAPTURE_API_KEY` for production
- `.dev.vars` entry for local dev
- Security note: never commit to version control
- Mapping note: *"In curl examples below, this is `$WRL_API_KEY`."*

Place this **before** the signing key section -- the capture API key is required for basic operation, while the signing key is optional (captures work without it, just no WACZ bundles). This ordering follows progressive complexity.

### Task 3: Add the linking line from API section to openapi.yaml

Replace or augment the existing terse "API" section (`See openapi.yaml for the full API specification.`) with a sentence that connects the Usage examples to the full spec:

> The [Usage](#usage) section shows the core workflow. For all endpoints, request/response schemas, and error codes, see [`openapi.yaml`](openapi.yaml).

This eliminates redundancy (no need for a separate "API" section that just says "see elsewhere") and provides the bridge from happy-path examples to full reference.

## Risks and Concerns

### Risk 1: `wrl.example.com` will confuse copy-paste developers

The openapi.yaml uses `https://wrl.example.com` as the server URL. This is correct for the spec but will trip up developers who copy-paste the curl commands without substituting their actual deployment URL. The README should include a note at the top of the usage section:

> Replace `wrl.example.com` with your deployment URL. If running locally: `http://localhost:8787`.

Alternatively, show `$WRL_HOST` as an env var alongside `$WRL_API_KEY`. I lean toward the explicit note rather than another env var -- two env vars to set before the first example is one too many for onboarding.

### Risk 2: Usage before Setup creates a chicken-and-egg problem

The metaplan defines the order as: positioning -> usage examples -> setup. This means a first-time visitor sees curl examples for an API they haven't deployed yet. This is actually fine -- the examples show *what the product does*, not *how to set it up*. But the section needs a clear signpost:

> Requires a running WRL instance. See [Setup](#setup) below.

One line, above step 1. This prevents the developer from thinking the examples are broken and ensures they know to scroll down for setup.

### Risk 3: CAPTURE_API_KEY vs WRL_API_KEY naming confusion

The README will use `WRL_API_KEY` in examples but `CAPTURE_API_KEY` in the setup section (because that's the actual Cloudflare secret name). This needs explicit bridging:

```
### Set the capture API key

...
wrangler secret put CAPTURE_API_KEY
...

This key is referenced as `$WRL_API_KEY` in the usage examples below.
```

Without this bridge, a developer will set `WRL_API_KEY` as a Wrangler secret (wrong) or use `$CAPTURE_API_KEY` in their shell (works, but mismatches the examples).

### Risk 4: Walkthrough length versus scannability

Four numbered steps with curl blocks, response examples, and narrative text can easily hit 50+ lines. If the positioning section and badges above it are also substantial, the "Setup" section gets pushed far below the fold. Monitor the total line count. If the Usage section exceeds 60 lines of rendered markdown, consider:

- Collapsing the response JSON into a `<details>` block
- Removing the jq example from step 4

But do not pre-optimize -- write it first, then evaluate.

## Additional Agents Needed

None beyond what the metaplan already includes. The four-agent consultation (devx-minion, product-marketing-minion, user-docs-minion, ux-strategy-minion) covers all the concerns. Specifically:

- **ux-strategy-minion** should validate my recommendation on the chicken-and-egg ordering (usage before setup). If they disagree, their recommendation should take precedence on information architecture -- my expertise is on the curl examples themselves, not the overall page journey.
- **user-docs-minion** should decide whether the existing Key Rotation and Public Key Endpoint subsections stay inline or move to a reference section. I have no strong opinion on this -- it affects scannability but not the developer's first-run experience.
