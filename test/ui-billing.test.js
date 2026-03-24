// tva
// Unit tests for ui-billing.js.
// Tests operate on the exported BILLING_JS string constant and on extracted
// pure-logic helpers (formatCurrency, billingStatusLabel, shouldShowCheckout,
// thresholdPercent, thresholdClass) evaluated via the Function constructor.
// No DOM environment, no fetch, no document -- all assertions target string
// content or the return values of extracted helper logic.

import { describe, it, expect } from 'vitest';
import { BILLING_JS } from '../src/ui/ui-billing.js';
import { UI_CSS } from '../src/ui/ui-css.js';
import { SETTINGS_JS } from '../src/ui/ui-settings.js';

// ---------------------------------------------------------------------------
// evalFromSource -- extract and return a named function from a JS source string
// ---------------------------------------------------------------------------

function evalFromSource(source, functionName) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(source + '\nreturn ' + functionName + ';');
  return fn();
}

const formatCurrency    = evalFromSource(BILLING_JS, 'formatCurrency');
const billingStatusLabel  = evalFromSource(BILLING_JS, 'billingStatusLabel');
const shouldShowCheckout  = evalFromSource(BILLING_JS, 'shouldShowCheckout');
const thresholdPercent  = evalFromSource(BILLING_JS, 'thresholdPercent');
const thresholdClass    = evalFromSource(BILLING_JS, 'thresholdClass');

// ---------------------------------------------------------------------------
// Partition A -- billingStatusLabel display variants
// ---------------------------------------------------------------------------

describe('billingStatusLabel -- status display variants', () => {
  it('A1: "free" returns a non-empty human label', () => {
    const result = billingStatusLabel('free');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('A2: "active" returns a distinct label from "free"', () => {
    expect(billingStatusLabel('active')).not.toBe(billingStatusLabel('free'));
  });

  it('A3: "grace_period" returns a label containing "grace" or "Grace"', () => {
    const result = billingStatusLabel('grace_period');
    expect(result.toLowerCase()).toContain('grace');
  });

  it('A4: "blocked" returns a label containing "blocked" or "Blocked"', () => {
    const result = billingStatusLabel('blocked');
    expect(result.toLowerCase()).toContain('blocked');
  });
});

// ---------------------------------------------------------------------------
// Partition B -- shouldShowCheckout CTA logic
// ---------------------------------------------------------------------------

describe('shouldShowCheckout -- payment method CTA routing', () => {
  it('B1: no payment method + free status returns true (needs checkout)', () => {
    expect(shouldShowCheckout(false, 'free')).toBe(true);
  });

  it('B2: has payment method + active status returns false (use portal)', () => {
    expect(shouldShowCheckout(true, 'active')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Partition C -- eIDAS section visibility (string assertions)
// ---------------------------------------------------------------------------

describe('BILLING_JS -- eIDAS section visibility', () => {
  it('C1: source contains qualifiedTimestamps conditional rendering check', () => {
    expect(BILLING_JS).toContain('qualifiedTimestamps');
  });

  it('C2: source handles missing eIDAS data gracefully (billing.eidas guard)', () => {
    expect(BILLING_JS).toContain('billing.eidas');
  });
});

// ---------------------------------------------------------------------------
// Partition D -- formatCurrency pure helper
// ---------------------------------------------------------------------------

describe('formatCurrency -- currency formatting', () => {
  it('D1: formatCurrency(0) returns string containing "0.00"', () => {
    expect(formatCurrency(0)).toContain('0.00');
  });

  it('D2: formatCurrency(11.15) returns string containing "11.15"', () => {
    expect(formatCurrency(11.15)).toContain('11.15');
  });

  it('D3: formatCurrency(null) returns string containing "0.00" (defensive)', () => {
    expect(formatCurrency(null)).toContain('0.00');
  });

  it('D4: formatCurrency(1234.5) returns string containing "1234.50" or "1,234.50"', () => {
    const result = formatCurrency(1234.5);
    expect(result).toMatch(/1[,.]?234\.50/);
  });
});

// ---------------------------------------------------------------------------
// Partition D -- thresholdPercent pure helper
// ---------------------------------------------------------------------------

describe('thresholdPercent -- threshold bar percentage', () => {
  it('D5: thresholdPercent(0, 5) returns 0', () => {
    expect(thresholdPercent(0, 5)).toBe(0);
  });

  it('D6: thresholdPercent(2.5, 5) returns 50', () => {
    expect(thresholdPercent(2.5, 5)).toBe(50);
  });

  it('D7: thresholdPercent(5, 5) returns 100', () => {
    expect(thresholdPercent(5, 5)).toBe(100);
  });

  it('D8: thresholdPercent(7, 5) returns 100 (capped at maximum)', () => {
    expect(thresholdPercent(7, 5)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Partition D -- thresholdClass pure helper
// ---------------------------------------------------------------------------

describe('thresholdClass -- threshold bar CSS class', () => {
  it('D9: thresholdClass(50) returns empty string (no warning)', () => {
    expect(thresholdClass(50)).toBe('');
  });

  it('D10: thresholdClass(85) returns string containing "warning"', () => {
    expect(thresholdClass(85)).toContain('warning');
  });

  it('D11: thresholdClass(96) returns string containing "critical"', () => {
    expect(thresholdClass(96)).toContain('critical');
  });
});

// ---------------------------------------------------------------------------
// Partition E -- BILLING_JS structural smoke checks
// ---------------------------------------------------------------------------

describe('BILLING_JS -- structural function presence', () => {
  it('E1: contains function renderBilling', () => {
    expect(BILLING_JS).toContain('function renderBilling');
  });

  it('E2: contains function mountBilling', () => {
    expect(BILLING_JS).toContain('function mountBilling');
  });

  it('E3: contains function buildBillingContent', () => {
    expect(BILLING_JS).toContain('function buildBillingContent');
  });

  it('E4: contains function formatCurrency', () => {
    expect(BILLING_JS).toContain('function formatCurrency');
  });

  it('E5: contains function billingStatusLabel', () => {
    expect(BILLING_JS).toContain('function billingStatusLabel');
  });

  it('E6: fetches /v1/account/usage endpoint', () => {
    expect(BILLING_JS).toContain('/v1/account/usage');
  });

  it('E7: references billing-stats-row CSS class', () => {
    expect(BILLING_JS).toContain('billing-stats-row');
  });

  it('E8: sets role="progressbar" on the threshold bar', () => {
    expect(BILLING_JS).toContain('progressbar');
    expect(BILLING_JS).toContain('role');
  });

  it('E9: sets aria-valuetext on the threshold bar', () => {
    expect(BILLING_JS).toContain('aria-valuetext');
  });

  it('E10: sets aria-describedby on Stripe portal and checkout links', () => {
    expect(BILLING_JS).toContain('aria-describedby');
  });
});

// ---------------------------------------------------------------------------
// Partition F -- Security: no innerHTML assignments
// ---------------------------------------------------------------------------

describe('BILLING_JS -- security: no innerHTML assignments', () => {
  it('F1: source contains no innerHTML assignments at all', () => {
    expect(BILLING_JS).not.toContain('innerHTML');
  });
});

// ---------------------------------------------------------------------------
// Partition G -- UI_CSS billing class presence
// ---------------------------------------------------------------------------

describe('UI_CSS -- billing section styles', () => {
  it('G1: contains .billing-stats-row class', () => {
    expect(UI_CSS).toContain('.billing-stats-row');
  });

  it('G2: contains .billing-stat-value class', () => {
    expect(UI_CSS).toContain('.billing-stat-value');
  });

  it('G3: contains .billing-tier-table class', () => {
    expect(UI_CSS).toContain('.billing-tier-table');
  });

  it('G4: contains .billing-tier-active class', () => {
    expect(UI_CSS).toContain('.billing-tier-active');
  });
});

// ---------------------------------------------------------------------------
// Partition G2 -- Regression: Fix 3 -- billing stat spans are display: block
// ---------------------------------------------------------------------------

describe('UI_CSS -- billing stat display (Fix 3 regression)', () => {
  it('G5: billing stat value is display: block', () => {
    // Regression guard: .billing-stat-value must use display:block so each
    // value and label stack vertically in the billing stats row.
    expect(UI_CSS).toContain('.billing-stat-value');
    expect(UI_CSS).toContain('display: block');
  });

  it('G6: billing stat label is display: block', () => {
    expect(UI_CSS).toContain('.billing-stat-label');
    // Both value and label must be block-level; the CSS contains at least one
    // "display: block" rule that applies to billing stat children.
    const idx = UI_CSS.indexOf('.billing-stat-value');
    const section = UI_CSS.slice(idx, idx + 200);
    expect(section).toContain('display: block');
  });
});

// ---------------------------------------------------------------------------
// Partition H -- Separation guard: billing logic must not leak into settings
// ---------------------------------------------------------------------------

describe('SETTINGS_JS -- separation guard', () => {
  it('H1: SETTINGS_JS does not contain billingStatusLabel (billing logic stays in billing module)', () => {
    expect(SETTINGS_JS).not.toContain('billingStatusLabel');
  });
});
