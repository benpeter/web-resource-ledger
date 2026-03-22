# WRL Design System — Style Guide

## Design Principles

WRL communicates institutional trust, precision, and restraint — the visual register of notarial seals and legal instruments. The dark ink-blue primary palette evokes official documents without feeling cold. The system is implemented entirely in pure CSS custom properties with no framework dependency. Under 5 KB is success; 10 KB is the ceiling.

---

## Color Palette

### Neutral

| Token | Hex | OKLCH | Purpose |
|---|---|---|---|
| `--color-text` | `#1e2a36` | `oklch(0.25 0.03 250)` | Body text |
| `--color-text-muted` | `#6e6a66` | `oklch(0.52 0.01 80)` | Secondary text, labels |
| `--color-bg` | `#f7f6f5` | `oklch(0.97 0.003 80)` | Page background |
| `--color-surface` | `#ffffff` | `oklch(1.0 0 0)` | Card / panel background |
| `--color-surface-muted` | `#f3f2f0` | `oklch(0.96 0.003 80)` | Code blocks, table headers |
| `--color-border` | `#dddbd8` | `oklch(0.88 0.005 80)` | Default borders |
| `--color-border-subtle` | `#ece9e6` | `oklch(0.93 0.003 80)` | Dividers, row separators |

### Brand

| Token | Hex | OKLCH | Purpose |
|---|---|---|---|
| `--color-primary` | `#2a3444` | `oklch(0.35 0.05 250)` | Primary actions, wordmark |
| `--color-secondary` | `#5a6577` | `oklch(0.50 0.03 250)` | Secondary actions |
| `--color-accent` | `#3d7c9a` | `oklch(0.55 0.08 230)` | Links, highlights |

### Semantic

| Token | Hex | Purpose |
|---|---|---|
| `--color-success` | `#2e7d32` | Success icon / border |
| `--color-success-bg` | `#e8f5e9` | Success banner / alert background |
| `--color-success-text` | `#1b5e20` | Success text |
| `--color-error` | `#c62828` | Error icon / border |
| `--color-error-bg` | `#ffebee` | Error banner / alert background |
| `--color-error-text` | `#b71c1c` | Error text |
| `--color-warning` | `#e6a817` | Warning icon / border |
| `--color-warning-bg` | `#fff8e1` | Warning alert background |
| `--color-warning-text` | `#7a5800` | Warning text |
| `--color-info` | `#1565c0` | Info icon / border |
| `--color-info-bg` | `#e3f2fd` | Info alert background |

### WCAG AA Contrast (key pairs)

| Foreground | Background | Ratio |
|---|---|---|
| `--color-text` | `--color-surface` | ~14:1 |
| `--color-text-muted` | `--color-surface` | ~5.0:1 |
| `--color-text-muted` | `--color-bg` | ~4.6:1 |
| `--color-success-text` | `--color-success-bg` | ~4.8:1 |
| `--color-error-text` | `--color-error-bg` | ~5.6:1 |
| `--color-warning-text` | `--color-warning-bg` | ~6.1:1 |

---

## Typography

### Font stacks

| Token | Stack |
|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--font-mono` | `"SF Mono", "Fira Code", Menlo, Consolas, monospace` |

### Scale

| Token | rem | px (16px base) |
|---|---|---|
| `--text-xs` | `0.75rem` | 12px |
| `--text-sm` | `0.8125rem` | 13px |
| `--text-base` | `0.875rem` | 14px |
| `--text-md` | `1rem` | 16px |
| `--text-lg` | `1.125rem` | 18px |
| `--text-xl` | `1.25rem` | 20px |
| `--text-2xl` | `1.5rem` | 24px |

### Line heights and weights

| Token | Value |
|---|---|
| `--leading-tight` | `1.2` |
| `--leading-normal` | `1.5` |
| `--leading-relaxed` | `1.6` |
| `--weight-normal` | `400` |
| `--weight-medium` | `600` |
| `--weight-bold` | `700` |

---

## Spacing

| Token | rem | px (16px base) |
|---|---|---|
| `--space-1` | `0.25rem` | 4px |
| `--space-2` | `0.5rem` | 8px |
| `--space-3` | `0.75rem` | 12px |
| `--space-4` | `1rem` | 16px |
| `--space-5` | `1.25rem` | 20px |
| `--space-6` | `1.5rem` | 24px |
| `--space-8` | `2rem` | 32px |
| `--space-12` | `3rem` | 48px |

---

## Shape

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `2px` | Badges, tight corners |
| `--radius-md` | `4px` | Inputs, buttons, alerts |
| `--radius-lg` | `6px` | Cards, panels |

---

## Usage Examples

**Body element — background and typography tokens**
```css
body {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-text);
  background: var(--color-bg);
  padding: var(--space-6) var(--space-4);
}
```

**Status banner — semantic color tokens**
```css
.status-banner.verified { background: var(--color-success-bg); }
.status-banner.unverified { background: var(--color-error-bg); }
.status-icon.verified { color: var(--color-success); }
.status-icon.unverified { color: var(--color-error); }
```

**Section heading — typography and color tokens**
```css
h2 {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}
```

**Code block — surface-muted and mono font tokens**
```css
.code-block {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}
```

---

## Logo and Favicon

Two logo concepts live in `src/assets/`:

- `logo-w-check.svg` — W-check mark (selected as primary mark)
- `logo-doc-check.svg` — Document with check mark (alternate concept)

The **W-check** is the active primary mark. The favicon is an inline SVG data URI injected into the `<link rel="icon">` tag. A `/favicon.ico` route serves the same SVG with `Content-Type: image/svg+xml` and a 7-day cache header.

---

## Rules

1. **Do** use semantic tokens (`var(--color-success-bg)`), not raw hex values.
2. **Do** use the spacing scale (`var(--space-4)`), not arbitrary rem values.
3. **Don't** add new custom properties without adding them to `src/design-system.css` first.
4. **Don't** use `!important` — fix specificity in the cascade instead.
5. **Don't** embed page-specific styles in `design-system.css`; those belong in the consuming module.
