---
phase: "0092"
name: license-switch
---

# Decisions

## License choice: PolyForm Shield 1.0.0

PolyForm Shield 1.0.0 was chosen over four alternatives:

- **FSL 1.1** -- converts to Apache 2.0 after two years. The time-based
  conversion is a fundamental mismatch: WRL's competitive moat does not expire,
  so a permanent protection was required.
- **BSL 1.1** -- requires a custom Additional Use Grant to be meaningful.
  Without that grant, BSL prohibits nearly all production use. Authoring the
  grant introduces legal ambiguity and drafting overhead.
- **SSPL** -- MongoDB's license is widely considered hostile by the open-source
  community and has been rejected by OSI. Carries reputational risk disproportionate
  to the protection it offers.
- **CC BY-NC** -- Creative Commons licenses are not designed for software. They
  do not address patent grants, warranty disclaimers, or contributor licensing,
  and their use in software is strongly discouraged by Creative Commons itself.

PolyForm Shield is the narrowest possible restriction: it only prohibits using
the software to offer a competing service. All other use -- personal, commercial,
internal tooling, academic -- is permitted. The license text is written in plain
English and is short enough to read in under five minutes.

## Terminology: "source-available"

"Open source" would be inaccurate: PolyForm Shield is not an OSI-approved license.
"Community license" is vague and carries no technical meaning.

"Source-available" is the accepted industry term for publicly readable code under
a non-permissive license. Elastic, HashiCorp, and Sentry all used this terminology
when making comparable relicensing moves.

All references to WRL's licensing posture were updated from "open source" to
"source-available" (or in some contexts "public source code" where the emphasis
is on visibility rather than the license category).

## package.json license field: "SEE LICENSE IN LICENSE"

PolyForm Shield 1.0.0 has no SPDX identifier. The SPDX specification does not
include it. Using a made-up identifier like `PolyForm-Shield-1.0.0` would be
invalid SPDX and could confuse tooling that validates license expressions.

npm's documented convention for non-SPDX licenses is the string
`"SEE LICENSE IN LICENSE"`. This is the correct field value.

## CLA: not added

A Contributor License Agreement was explicitly considered and rejected. The
project currently has zero external contributors. A CLA creates friction for
any future contributor disproportionate to the benefit at this scale.

Instead, an inbound=outbound contribution clause was added to `CONTRIBUTING.md`:
contributions are licensed under the same terms as the project. This is the
standard lightweight alternative used by projects that want clear IP ownership
without a CLA process.

## Comparison table column header: renamed to "Source"

The docs site comparison table previously had an "Open Source" column header.
Keeping WRL in a column labelled "Open Source" while the rest of the site
describes it as source-available would directly contradict the messaging change.
The column was renamed to "Source" to accurately describe the category.

A footnote disclaimer on the old header was considered and rejected: it would
still contain the inaccurate label in a prominent position.

## No "why we changed" section on the landing page

The landing page serves prospective customers who have no prior relationship with
the Apache 2.0 license. Explaining the change would introduce confusion for an
audience that does not need the context. The changelog and/or a future blog post
are the appropriate venues for existing users and the developer community.
