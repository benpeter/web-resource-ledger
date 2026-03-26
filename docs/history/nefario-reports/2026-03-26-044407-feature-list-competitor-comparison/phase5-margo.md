# Margo Complexity Review — Feature List + Competitor Comparison

**VERDICT: ADVISE**

The work is proportional to the problem and contains no YAGNI violations or scope inflation. Two findings require attention before close; neither blocks merge.

---

## Finding 1: Duplicated CSS block (accidental complexity)

**What**: The mobile card-stack pattern for `.comparison-table` is duplicated verbatim across two files:
- `landing/public/css/landing.css` lines 533–573
- `site/css/docs.css` lines 571–627

Both files carry explicit sync comments ("Sync note: equivalent pattern in...") acknowledging the duplication. Sync comments are not a solution — they are a flag that says "this will drift."

**Why it appears accidental**: These two CSS contexts have no sharing mechanism today, which is why the duplication exists. The sync comment trades one problem (complexity of sharing) for another (maintenance drift). But the mobile card-stack is ~30 lines of non-trivial layout logic involving `display:block` overrides, `::before` pseudo-element label injection, and `clip` hiding. When one copy gets an edge case fix, the other will not.

**Concrete difference already present**: `docs.css` uses `--color-text-muted-docs` in the `::before` label (line 612) while `landing.css` uses `--color-text-muted` (line 566). This is already diverged. Also `docs.css` resets `overflow-x: visible` and `margin: 0` on mobile (lines 573–575), `landing.css` does not — because the wrapper context differs. These differences are valid, which means the blocks are not truly duplicated — they are *similar but contextually distinct*, which makes a shared file even less appropriate than it first appears.

**Revised assessment**: The divergence is intentional and contextually justified. The sync comments are a maintenance reminder, not a design flaw. This remains an ADVISE item — the team should be aware that these blocks will continue to diverge and should stop treating them as "in sync." The sync comments should be reworded to say "similar pattern — contexts differ, do not attempt to share."

---

## Finding 2: Landing comparison table is a subset of the docs table

**What**: `index.html` shows 4 columns × 5 rows. `compare.njk` shows 8 columns × 10 rows. The landing table is a deliberate editorial summary, not duplication. This is fine.

**No action needed.** The intent is clear (landing = teaser, docs = full detail) and both link to each other explicitly.

---

## Finding 3: Structured data `featureList` is a maintenance liability (minor)

**What**: `index.html` lines 59–75 contain a 15-item `featureList` array in the `SoftwareApplication` JSON-LD block. Several items (e.g., "Batch capture API", "Webhook notifications", "Scheduled captures") describe features that are not covered in the visible landing page content.

**Why it matters**: JSON-LD structured data requires manual sync with actual product capabilities. A feature listed here but not yet shipped, or removed without updating this block, creates a misleading signal to search engines and scrapers. The `featureList` is also the kind of aspirational list that tends to grow without pruning.

**Simpler alternative**: Trim `featureList` to only features that appear in the landing page's visible content (the features grid and use cases sections). This gives structured data that cannot diverge from what a visitor actually sees. Items like "CLI verification tool" and "eIDAS-qualified timestamps" are covered on the page; items like "Scheduled captures" and "Webhook notifications" are not.

---

## Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | CSS card-stack sync comments imply shared code that doesn't exist | Low | Reword sync comments to clarify intentional divergence |
| 2 | Landing vs. docs table column difference | None | No action |
| 3 | `featureList` in JSON-LD contains features absent from visible page content | Low | Trim to features visible on the landing page |

No unjustified complexity budget spend. No YAGNI violations. No new dependencies. No abstraction layers. The comparison table and features grid are straightforward HTML+CSS delivering real user value. Infrastructure is unchanged.
