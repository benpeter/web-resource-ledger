## Problem

The "Sign in" button in the **landing page header** (`landing/public/index.html`, line 95) has unreadable text. The text renders as dark gray on a dark navy background — roughly 2.5:1 contrast ratio, well below WCAG AA 4.5:1.

This is NOT the same button that was investigated in #211 / phase 0080. That analysis looked at `.btn--github` inside the app UI (`src/ui/ui-login.js`). This button is a different element in a different codebase.

## Where to look

- **Element**: `<a href="..." class="btn btn--primary btn--sm">Sign in</a>` inside `<nav>` inside `.site-header`
- **File**: `landing/public/index.html` (line 95), also present in `privacy.html`, `security.html`, `terms.html`, `refund-policy.html`, `content-policy.html`, `404.html`
- **Styles involved**:
  - `landing/public/css/landing.css:167` — `.site-header nav a` sets `color: var(--color-text-muted)`
  - `landing/public/css/design-system.css:83` — `.btn--primary` sets `color: var(--color-primary-text)`
  - The nav link color wins over the button color, so the button text is muted instead of white

## What "done" looks like

The "Sign in" button in the landing page header has white (or near-white) text on the dark primary background, matching how `.btn--primary` looks everywhere else. All landing pages affected. No visual change to the other nav links (How It Works, Use Cases, Pricing, Docs).

## Verification

Open any landing page (index, privacy, terms, etc.) and confirm the Sign in button text is clearly legible against its dark background.
